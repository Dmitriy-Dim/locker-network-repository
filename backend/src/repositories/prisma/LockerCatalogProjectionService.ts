import {LockerStatus, Prisma, TechnicalStatus} from "@prisma/client";

import {
    CityCacheDto,
    LockerCacheDto,
    LockerResponseDto,
    StationCacheDto,
    StationCacheLockerDto,
    StationListItemDto
} from "../../contracts/cache.dto";
import {logger} from "../../Logger/winston";
import {lockerCacheRepository} from "../cache/LockerCacheRepository";
import {prismaService} from "../../services/prismaService";
import {isDynamoAccessError} from "../../utils/awsErrors";

import {TransactionClient} from "./transactionClient";

function decimalToString(value: Prisma.Decimal | null | undefined) {
    return value ? value.toString() : null;
}

function buildPricingMap(
    pricing: Array<{
        cityId: string;
        size: string;
        pricePerHour: Prisma.Decimal
    }>
) {
    return new Map(pricing.map((item) => [`${item.cityId}-${item.size}`, item.pricePerHour.toString()]));
}

function stationProjectionVersion(updatedAt: Date, version: number) {
    return updatedAt.getTime() * 1000 + version;
}

function fallbackLockerState(locker: {
    status: LockerStatus | null;
    techStatus: TechnicalStatus;
    version: number;
    lastStatusChangedAt: Date;
}) {
    return {
        status: locker.status,
        techStatus: locker.techStatus,
        version: locker.version,
        lastStatusChangedAt: locker.lastStatusChangedAt.toISOString(),
    };
}

function buildLockerProjectionFromRds(locker: {
    lockerBoxId: string;
    stationId: string;
    code: string;
    size: "S" | "M" | "L";
    status: LockerStatus | null;
    techStatus: TechnicalStatus;
    version: number;
    lastStatusChangedAt: Date;
    station: {
        address: string | null;
        latitude: number;
        longitude: number;
        status: "READY" | "ACTIVE" | "INACTIVE" | "MAINTENANCE";
        city: {
            code: string;
            name: string;
            Pricing: Array<{
                size: "S" | "M" | "L";
                pricePerHour: Prisma.Decimal
            }>;
        };
    };
}): LockerCacheDto {
    const priceItem = locker.station.city.Pricing.find((item) => item.size === locker.size);

    return {
        lockerBoxId: locker.lockerBoxId,
        stationId: locker.stationId,
        code: locker.code,
        size: locker.size,
        status: locker.status,
        techStatus: locker.techStatus,
        version: locker.version,
        lastStatusChangedAt: locker.lastStatusChangedAt.toISOString(),
        pricePerHour: decimalToString(priceItem?.pricePerHour),
        station: {
            address: locker.station.address ?? null,
            latitude: locker.station.latitude,
            longitude: locker.station.longitude,
            status: locker.station.status,
            city: {
                code: locker.station.city.code,
                name: locker.station.city.name,
            },
        },
    };
}

async function loadCachedLockersByStationId(stationId: string, lockerCount: number) {
    if (lockerCount === 0) {
        return [];
    }

    try {
        return await lockerCacheRepository.findByStationId(stationId);
    } catch (error) {
        if (!isDynamoAccessError(error)) {
            throw error;
        }

        logger.warn("Locker cache Dynamo read failed while building station projection, falling back to RDS state", {
            stationId,
            error,
        });

        return [];
    }
}

function groupCachedLockersByStation(cachedLockers: LockerCacheDto[]) {
    return cachedLockers.reduce<Map<string, LockerCacheDto[]>>((acc, locker) => {
        const current = acc.get(locker.stationId) ?? [];
        current.push(locker);
        acc.set(locker.stationId, current);
        return acc;
    }, new Map<string, LockerCacheDto[]>());
}

async function loadCachedLockerById(lockerBoxId: string) {
    try {
        return await lockerCacheRepository.findById(lockerBoxId);
    } catch (error) {
        if (!isDynamoAccessError(error)) {
            throw error;
        }

        logger.warn("Locker cache Dynamo read failed while building locker projection, falling back to RDS state", {
            lockerBoxId,
            error,
        });

        return null;
    }
}

async function loadAllCachedLockers() {
    try {
        return await lockerCacheRepository.findAll();
    } catch (error) {
        if (!isDynamoAccessError(error)) {
            throw error;
        }

        logger.warn("Locker cache Dynamo full read failed while building catalog projections, falling back to RDS state", {
            error,
        });

        return [];
    }
}

interface ILockerCatalogProjectionService {
    getStationCacheProjection(stationId: string): Promise<StationCacheDto | null>;
    getLockerCacheProjection(lockerBoxId: string): Promise<LockerCacheDto | null>;
    getStationAdminProjection(stationId: string): Promise<StationCacheDto | null>;
    getLockerAdminProjection(lockerBoxId: string): Promise<LockerCacheDto | null>;
    getLockerCacheProjectionsByStationId(stationId: string): Promise<LockerCacheDto[]>;
    getStationCacheProjectionsByCityId(cityId: string): Promise<StationCacheDto[]>;
    getLockerCacheProjectionsByCityIdAndSize(cityId: string, size: "S" | "M" | "L"): Promise<LockerCacheDto[]>;
    getAllStationCacheProjections(): Promise<StationCacheDto[]>;
    getAllLockerCacheProjections(): Promise<LockerCacheDto[]>;
    getAllCityCacheProjections(): Promise<CityCacheDto[]>;
    getCityCacheProjection(cityId: string): Promise<CityCacheDto | null>;
    getAllStationsAdminView(): Promise<StationListItemDto[]>;
    getAllLockersAdminView(): Promise<LockerResponseDto[]>;
    getLockerIdsByStationId(stationId: string): Promise<string[]>;
}

class LockerCatalogProjectionService implements ILockerCatalogProjectionService {
    async getStationCacheProjection(stationId: string, tx: TransactionClient | typeof prismaService = prismaService): Promise<StationCacheDto | null> {
        const station = await tx.lockerStation.findUnique({
            where: {stationId},
            include: {
                city: {
                    select: {
                        code: true,
                        name: true,
                        Pricing: true,
                    }
                },
                lockers: {
                    where: {isDeleted: false},
                    orderBy: {createdAt: "asc"},
                },
            },
        });

        if (!station) {
            return null;
        }

        if (station.isDeleted) {
            return null;
        }

        const pricingMap = buildPricingMap(
            station.city.Pricing.map((item) => ({
                cityId: station.cityId,
                size: item.size,
                pricePerHour: item.pricePerHour,
            }))
        );

        const cachedLockers = await loadCachedLockersByStationId(station.stationId, station.lockers.length);
        const cachedLockersMap = new Map(cachedLockers.map((item) => [item.lockerBoxId, item]));

        const lockers: StationCacheLockerDto[] = station.lockers.map((locker) => ({
            ...(cachedLockersMap.get(locker.lockerBoxId)
                ? {
                    status: cachedLockersMap.get(locker.lockerBoxId)!.status,
                    techStatus: locker.techStatus,
                    version: cachedLockersMap.get(locker.lockerBoxId)!.version,
                    lastStatusChangedAt: cachedLockersMap.get(locker.lockerBoxId)!.lastStatusChangedAt,
                }
                : fallbackLockerState(locker)),
            lockerBoxId: locker.lockerBoxId,
            stationId: locker.stationId,
            code: locker.code,
            size: locker.size,
            pricePerHour: pricingMap.get(`${station.cityId}-${locker.size}`) ?? null,
        }));

        return {
            stationId: station.stationId,
            cityId: station.cityId,
            address: station.address ?? null,
            latitude: station.latitude,
            longitude: station.longitude,
            status: station.status,
            version: stationProjectionVersion(station.updatedAt, station.version),
            availableLockers: lockers.filter((locker) => locker.status === "AVAILABLE" && locker.techStatus === "ACTIVE").length,
            city: {
                code: station.city.code,
                name: station.city.name,
            },
            lockers,
        };
    }

    async getLockerCacheProjection(lockerBoxId: string, tx: TransactionClient | typeof prismaService = prismaService): Promise<LockerCacheDto | null> {
        const locker = await tx.lockerBox.findUnique({
            where: {lockerBoxId},
            include: {
                station: {
                    include: {
                        city: {
                            select: {
                                code: true,
                                name: true,
                                Pricing: true,
                            }
                        }
                    }
                }
            }
        });

        if (!locker) {
            return null;
        }

        if (locker.isDeleted || locker.station.isDeleted) {
            return null;
        }

        const priceItem = locker.station.city.Pricing.find((item) => item.size === locker.size);
        const cachedLocker = await loadCachedLockerById(lockerBoxId);
        const runtimeState = cachedLocker ?? fallbackLockerState(locker);

        return {
            lockerBoxId: locker.lockerBoxId,
            stationId: locker.stationId,
            code: locker.code,
            size: locker.size,
            status: runtimeState.status,
            techStatus: locker.techStatus,
            version: runtimeState.version,
            lastStatusChangedAt: runtimeState.lastStatusChangedAt,
            pricePerHour: decimalToString(priceItem?.pricePerHour),
            station: {
                address: locker.station.address ?? null,
                latitude: locker.station.latitude,
                longitude: locker.station.longitude,
                status: locker.station.status,
                city: {
                    code: locker.station.city.code,
                    name: locker.station.city.name,
                },
            },
        };
    }

    async getLockerCacheProjectionsByStationId(stationId: string, tx: TransactionClient | typeof prismaService = prismaService): Promise<LockerCacheDto[]> {
        const lockers = await tx.lockerBox.findMany({
            where: {
                stationId,
                isDeleted: false,
                station: {
                    isDeleted: false,
                },
            },
            select: {lockerBoxId: true},
        });

        const projections = await Promise.all(lockers.map(({lockerBoxId}) => this.getLockerCacheProjection(lockerBoxId, tx)));
        return projections.filter((item): item is LockerCacheDto => item !== null);
    }

    async getStationCacheProjectionsByCityId(cityId: string, tx: TransactionClient | typeof prismaService = prismaService): Promise<StationCacheDto[]> {
        const stations = await tx.lockerStation.findMany({
            where: {
                cityId,
                isDeleted: false,
            },
            select: {stationId: true},
        });

        const projections = await Promise.all(stations.map(({stationId}) => this.getStationCacheProjection(stationId, tx)));
        return projections.filter((item): item is StationCacheDto => item !== null);
    }

    async getLockerCacheProjectionsByCityIdAndSize(
        cityId: string,
        size: "S" | "M" | "L",
        tx: TransactionClient | typeof prismaService = prismaService
    ): Promise<LockerCacheDto[]> {
        const lockers = await tx.lockerBox.findMany({
            where: {
                size,
                isDeleted: false,
                station: {
                    cityId,
                    isDeleted: false,
                },
            },
            select: {lockerBoxId: true},
        });

        const projections = await Promise.all(lockers.map(({lockerBoxId}) => this.getLockerCacheProjection(lockerBoxId, tx)));
        return projections.filter((item): item is LockerCacheDto => item !== null);
    }

    async getStationAdminProjection(stationId: string, tx: TransactionClient | typeof prismaService = prismaService): Promise<StationCacheDto | null> {
        const station = await tx.lockerStation.findUnique({
            where: {stationId},
            include: {
                city: {
                    select: {
                        code: true,
                        name: true,
                        Pricing: true,
                    }
                },
                lockers: {
                    where: {isDeleted: false},
                    orderBy: {createdAt: "asc"},
                },
            },
        });

        if (!station || station.isDeleted) {
            return null;
        }

        const pricingMap = buildPricingMap(
            station.city.Pricing.map((item) => ({
                cityId: station.cityId,
                size: item.size,
                pricePerHour: item.pricePerHour,
            }))
        );

        const cachedLockers = await loadCachedLockersByStationId(station.stationId, station.lockers.length);
        const cachedLockersMap = new Map(cachedLockers.map((item) => [item.lockerBoxId, item]));

        const lockers: StationCacheLockerDto[] = station.lockers.map((locker) => ({
            ...(cachedLockersMap.get(locker.lockerBoxId)
                ? {
                    status: cachedLockersMap.get(locker.lockerBoxId)!.status,
                    techStatus: locker.techStatus,
                    version: cachedLockersMap.get(locker.lockerBoxId)!.version,
                    lastStatusChangedAt: cachedLockersMap.get(locker.lockerBoxId)!.lastStatusChangedAt,
                }
                : fallbackLockerState(locker)),
            lockerBoxId: locker.lockerBoxId,
            stationId: locker.stationId,
            code: locker.code,
            size: locker.size,
            pricePerHour: pricingMap.get(`${station.cityId}-${locker.size}`) ?? null,
        }));

        return {
            stationId: station.stationId,
            cityId: station.cityId,
            address: station.address ?? null,
            latitude: station.latitude,
            longitude: station.longitude,
            status: station.status,
            version: stationProjectionVersion(station.updatedAt, station.version),
            availableLockers: lockers.filter((locker) => locker.status === "AVAILABLE" && locker.techStatus === "ACTIVE").length,
            city: {
                code: station.city.code,
                name: station.city.name,
            },
            lockers,
        };
    }

    async getLockerAdminProjection(lockerBoxId: string, tx: TransactionClient | typeof prismaService = prismaService): Promise<LockerCacheDto | null> {
        const locker = await tx.lockerBox.findUnique({
            where: { lockerBoxId },
            include: {
                station: {
                    include: {
                        city: {
                            select: {
                                code: true,
                                name: true,
                                Pricing: true,
                            }
                        }
                    }
                }
            }
        });

        if (!locker || locker.isDeleted || locker.station.isDeleted) {
            return null;
        }

        const projection = buildLockerProjectionFromRds(locker);
        const cachedLocker = await loadCachedLockerById(lockerBoxId);
        const runtimeState = cachedLocker ?? fallbackLockerState(locker);

        return {
            ...projection,
            status: runtimeState.status,
            version: runtimeState.version,
            lastStatusChangedAt: runtimeState.lastStatusChangedAt,
        };
    }

    async getAllStationCacheProjections(tx: TransactionClient | typeof prismaService = prismaService): Promise<StationCacheDto[]> {
        const stations = await tx.lockerStation.findMany({
            where: {isDeleted: false},
            include: {
                city: {
                    select: {
                        code: true,
                        name: true,
                        Pricing: true,
                    }
                },
                lockers: {
                    where: {isDeleted: false},
                    orderBy: {createdAt: "asc"},
                },
            },
        });

        const cachedLockers = await loadAllCachedLockers();
        const cachedLockersByStation = groupCachedLockersByStation(cachedLockers);

        return stations.map((station) => {
            const pricingMap = buildPricingMap(
                station.city.Pricing.map((item) => ({
                    cityId: station.cityId,
                    size: item.size,
                    pricePerHour: item.pricePerHour,
                }))
            );

            const stationCachedLockers = cachedLockersByStation.get(station.stationId) ?? [];
            const cachedLockersMap = new Map(stationCachedLockers.map((item) => [item.lockerBoxId, item]));

            const lockers: StationCacheLockerDto[] = station.lockers.map((locker) => ({
                ...(cachedLockersMap.get(locker.lockerBoxId)
                    ? {
                        status: cachedLockersMap.get(locker.lockerBoxId)!.status,
                        techStatus: locker.techStatus,
                        version: cachedLockersMap.get(locker.lockerBoxId)!.version,
                        lastStatusChangedAt: cachedLockersMap.get(locker.lockerBoxId)!.lastStatusChangedAt,
                    }
                    : fallbackLockerState(locker)),
                lockerBoxId: locker.lockerBoxId,
                stationId: locker.stationId,
                code: locker.code,
                size: locker.size,
                pricePerHour: pricingMap.get(`${station.cityId}-${locker.size}`) ?? null,
            }));

            return {
                stationId: station.stationId,
                cityId: station.cityId,
                address: station.address ?? null,
                latitude: station.latitude,
                longitude: station.longitude,
                status: station.status,
                version: stationProjectionVersion(station.updatedAt, station.version),
                availableLockers: lockers.filter((locker) => locker.status === "AVAILABLE" && locker.techStatus === "ACTIVE").length,
                city: {
                    code: station.city.code,
                    name: station.city.name,
                },
                lockers,
            };
        });
    }

    async getAllLockerCacheProjections(tx: TransactionClient | typeof prismaService = prismaService): Promise<LockerCacheDto[]> {
        const lockers = await tx.lockerBox.findMany({
            where: {
                isDeleted: false,
                station: {
                    isDeleted: false,
                },
            },
            include: {
                station: {
                    include: {
                        city: {
                            select: {
                                code: true,
                                name: true,
                                Pricing: true,
                            }
                        }
                    }
                }
            }
        });

        const cachedLockers = await loadAllCachedLockers();
        const cachedLockersMap = new Map(cachedLockers.map((item) => [item.lockerBoxId, item]));

        return lockers.map((locker) => {
            const priceItem = locker.station.city.Pricing.find((item) => item.size === locker.size);
            const runtimeState = cachedLockersMap.get(locker.lockerBoxId) ?? fallbackLockerState(locker);

            return {
                lockerBoxId: locker.lockerBoxId,
                stationId: locker.stationId,
                code: locker.code,
                size: locker.size,
                status: runtimeState.status,
                techStatus: locker.techStatus,
                version: runtimeState.version,
                lastStatusChangedAt: runtimeState.lastStatusChangedAt,
                pricePerHour: decimalToString(priceItem?.pricePerHour),
                station: {
                    address: locker.station.address ?? null,
                    latitude: locker.station.latitude,
                    longitude: locker.station.longitude,
                    status: locker.station.status,
                    city: {
                        code: locker.station.city.code,
                        name: locker.station.city.name,
                    },
                },
            };
        });
    }

    async getAllStationsAdminView(tx: TransactionClient | typeof prismaService = prismaService): Promise<StationListItemDto[]> {
        const stations = await tx.lockerStation.findMany({
            where: {isDeleted: false},
            include: {
                city: {
                    select: {
                        code: true,
                        name: true,
                    }
                },
                _count: {
                    select: {
                        lockers: {
                            where: {isDeleted: false},
                        },
                    },
                },
            },
        });

        return stations.map((station) => ({
            stationId: station.stationId,
            cityId: station.cityId,
            address: station.address,
            latitude: station.latitude,
            longitude: station.longitude,
            status: station.status,
            version: stationProjectionVersion(station.updatedAt, station.version),
            distance: null,
            city: station.city,
            _count: {
                lockers: station._count.lockers,
            },
        }));
    }

    async getAllLockersAdminView(tx: TransactionClient | typeof prismaService = prismaService): Promise<LockerResponseDto[]> {
        const lockers = await tx.lockerBox.findMany({
            where: {
                isDeleted: false,
                station: {
                    isDeleted: false,
                },
            },
            include: {
                station: {
                    include: {
                        city: {
                            select: {
                                code: true,
                                name: true,
                                Pricing: true,
                            }
                        }
                    }
                }
            }
        });

        const cachedLockers = await loadAllCachedLockers();
        const cachedLockersMap = new Map(cachedLockers.map((item) => [item.lockerBoxId, item]));

        return lockers.map((locker) => {
            const projection = buildLockerProjectionFromRds(locker);
            const runtimeState = cachedLockersMap.get(locker.lockerBoxId) ?? fallbackLockerState(locker);

            return {
                lockerBoxId: projection.lockerBoxId,
                stationId: projection.stationId,
                code: projection.code,
                size: projection.size,
                status: runtimeState.status,
                techStatus: projection.techStatus,
                version: runtimeState.version,
                lastStatusChangedAt: runtimeState.lastStatusChangedAt,
                pricePerHour: projection.pricePerHour,
                station: {
                    address: projection.station.address,
                    city: projection.station.city.name,
                    latitude: projection.station.latitude,
                    longitude: projection.station.longitude,
                },
            };
        });
    }

    async getLockerIdsByStationId(stationId: string, tx: TransactionClient | typeof prismaService = prismaService): Promise<string[]> {
        const lockers = await tx.lockerBox.findMany({
            where: { stationId },
            select: { lockerBoxId: true },
        });

        return lockers.map((locker) => locker.lockerBoxId);
    }

    async getAllCityCacheProjections(tx: TransactionClient | typeof prismaService = prismaService): Promise<CityCacheDto[]> {
        const cities = await tx.city.findMany({
            where: {
                isActive: true,
            },
            select: {
                cityId: true,
                code: true,
                name: true,
            }
        });

         return cities;

    }

    async getCityCacheProjection(cityId: string, tx: TransactionClient | typeof prismaService = prismaService): Promise<CityCacheDto | null> {
    const city = await tx.city.findUnique({
        where: {cityId},
        select: {
            cityId: true,
            code: true,
            name: true,
            isActive: true,
        }
    });

    if (!city || !city.isActive) {
        return null;
    }

    return {
        cityId: city.cityId,
        code: city.code,
        name: city.name,
    };

}
}

export const lockerCatalogProjectionService = new LockerCatalogProjectionService();
