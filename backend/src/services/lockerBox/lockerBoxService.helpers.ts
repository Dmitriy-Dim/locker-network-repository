import {LockerStatus, StationStatus, TechnicalStatus} from "@prisma/client";

import {LockerCacheDto, LockerResponseDto} from "../../contracts/cache.dto";
import {HttpError} from "../../errorHandler/HttpError";
import {logger} from "../../Logger/winston";
import {
    lockerCacheRepository
} from "../../repositories/cache/LockerCacheRepository";
import {
    lockerCatalogProjectionService
} from "../../repositories/prisma/LockerCatalogProjectionService";
import {isDynamoAccessError} from "../../utils/awsErrors";
import {
    enqueueLockerProjectionDelete,
    enqueueLockerProjectionUpsert
} from "../sqsService";

export type LockerQuery = {
    stationId?: string;
    size?: "S" | "M" | "L";
    status?: LockerStatus;
};

export type StationCacheStatus = "SYNCED" | "FAILED" | "DEFERRED";
export type LockerCacheStatus = "SYNCED" | "FAILED" | "DEFERRED";

const ACTIVE_RUNTIME_STATUSES = new Set<LockerStatus>([
    "AVAILABLE",
    "RESERVED",
    "OCCUPIED",
    "EXPIRED",
]);

export function toLockerResponse(locker: LockerCacheDto): LockerResponseDto {
    return {
        lockerBoxId: locker.lockerBoxId,
        stationId: locker.stationId,
        code: locker.code,
        size: locker.size,
        status: locker.status,
        techStatus: locker.techStatus,
        version: locker.version,
        lastStatusChangedAt: locker.lastStatusChangedAt,
        pricePerHour: locker.pricePerHour,
        station: {
            address: locker.station.address,
            city: locker.station.city.name,
            latitude: locker.station.latitude,
            longitude: locker.station.longitude,
        },
    };
}

export function assertValidLockerStatusTransition(input: {
    nextStatus: LockerStatus;
    currentStatus: LockerStatus | null;
    techStatus: TechnicalStatus;
    stationStatus: StationStatus;
}) {
    const { nextStatus, currentStatus, techStatus, stationStatus } = input;

    if (currentStatus === nextStatus) {
        throw new HttpError(400, "Locker is already " + nextStatus);
    }

    if (nextStatus === "FAULTY") {
        throw new HttpError(400, "Use tech status endpoint to set locker FAULTY");
    }

    if (stationStatus !== "ACTIVE") {
        throw new HttpError(400, "Locker runtime status can be changed only when station is ACTIVE");
    }

    if (techStatus !== "ACTIVE") {
        throw new HttpError(400, "Locker runtime status can be changed only when tech status is ACTIVE");
    }

    if (!ACTIVE_RUNTIME_STATUSES.has(nextStatus)) {
        throw new HttpError(400, "Unsupported locker runtime status transition");
    }
}

export function resolveLockerStateForTechStatus(input: {
    currentStatus: LockerStatus | null;
    nextTechStatus: TechnicalStatus;
}) {
    const { currentStatus, nextTechStatus } = input;

    if (nextTechStatus === "ACTIVE") {
        return {
            nextStatus: currentStatus ?? "AVAILABLE",
            statusChanged: currentStatus === null,
        };
    }

    return {
        nextStatus: null,
        statusChanged: currentStatus !== null,
    };
}


export function lockerMeta(stationCacheStatus: StationCacheStatus, lockerCacheStatus: LockerCacheStatus) {
    return {
        stationCacheStatus,
        lockerCacheStatus,
    };
}

export async function syncLockerProjection(
    projection: Parameters<typeof lockerCacheRepository.upsert>[0],
    correlationId?: string,
    actorId?: string | null,
    projectionVersion = projection.version
) {
    try {
        await enqueueLockerProjectionUpsert(projection, correlationId, actorId, projectionVersion);
        return "DEFERRED" as const;
    } catch (error) {
        logger.error("Locker cache projection enqueue failed", {
            lockerBoxId: projection.lockerBoxId,
            error,
        });
        return "FAILED" as const;
    }
}

export async function deleteLockerProjection(lockerBoxId: string, version?: number, correlationId?: string, actorId?: string | null) {
    try {
        await enqueueLockerProjectionDelete(lockerBoxId, version, correlationId, actorId);
        return "DEFERRED" as const;
    } catch (error) {
        logger.error("Locker cache projection delete enqueue failed", {
            lockerBoxId,
            version,
            error,
        });
        return "FAILED" as const;
    }
}

export async function loadLockers() {
    try {
        const cachedLockers = await lockerCacheRepository.findAll();
        if (cachedLockers.length > 0) {
            return lockerCatalogProjectionService.getAllLockerCacheProjections();
        }

        return lockerCatalogProjectionService.getAllLockerCacheProjections();
    } catch (error) {
        if (!isDynamoAccessError(error)) {
            throw error;
        }

        return lockerCatalogProjectionService.getAllLockerCacheProjections();
    }
}

export async function loadOneLocker(lockerBoxId: string) {
    try {
        return await lockerCatalogProjectionService.getLockerCacheProjection(lockerBoxId);
    } catch (error) {
        if (!isDynamoAccessError(error)) {
            throw error;
        }

        return lockerCatalogProjectionService.getLockerCacheProjection(lockerBoxId);
    }
}
