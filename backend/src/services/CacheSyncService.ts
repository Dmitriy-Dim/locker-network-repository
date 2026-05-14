import { Request, Response } from "express";

import { LockerCacheDto, StationCacheDto } from "../contracts/cache.dto";
import { HttpError } from "../errorHandler/HttpError";
import { lockerCacheRepository } from "../repositories/cache/LockerCacheRepository";
import { stationCacheRepository } from "../repositories/cache/StationCacheRepository";
import { lockerCatalogProjectionService } from "../repositories/prisma/LockerCatalogProjectionService";
import { sendSuccess } from "../utils/response";
import { isDynamoAccessError } from "../utils/awsErrors";
import { isRedisAccessError } from "../utils/redisErrors";
import { logger } from "../Logger/winston";

import { enqueueLockerProjectionDelete, enqueueLockerProjectionUpsert } from "./sqsService";

type EntitySyncMode = "compare-and-fill" | "rds-fallback-full-resync";

function getStationSyncCandidates(
    source: StationCacheDto[],
    target: StationCacheDto[],
): StationCacheDto[] {
    const targetMap = new Map(target.map((item) => [item.stationId, item]));

    return source.filter((item) => {
        const cached = targetMap.get(item.stationId);
        return !cached || cached.version !== item.version;
    });
}

function getLockerSyncCandidates(
    source: LockerCacheDto[],
    target: LockerCacheDto[],
): LockerCacheDto[] {
    const targetMap = new Map(target.map((item) => [item.lockerBoxId, item]));

    return source.filter((item) => {
        const cached = targetMap.get(item.lockerBoxId);
        return !cached || cached.version !== item.version;
    });
}

function getStationDeleteCandidates(
    source: StationCacheDto[],
    target: StationCacheDto[],
): Array<{ stationId: string; version: number }> {
    const sourceIds = new Set(source.map((item) => item.stationId));

    return target
        .filter((item) => !sourceIds.has(item.stationId))
        .map((item) => ({
            stationId: item.stationId,
            version: item.version,
        }));
}

function getLockerDeleteCandidates(
    source: LockerCacheDto[],
    target: LockerCacheDto[],
): Array<{ lockerBoxId: string; version: number }> {
    const sourceIds = new Set(source.map((item) => item.lockerBoxId));

    return target
        .filter((item) => !sourceIds.has(item.lockerBoxId))
        .map((item) => ({
            lockerBoxId: item.lockerBoxId,
            version: item.version,
        }));
}

export class CacheSyncService {
    private async loadCatalogState() {
        const [stationProjections, lockerProjections] = await Promise.all([
            lockerCatalogProjectionService.getAllStationCacheProjections(),
            lockerCatalogProjectionService.getAllLockerCacheProjections(),
        ]);

        let cachedStations: StationCacheDto[] = [];
        let cachedLockers: LockerCacheDto[] = [];
        let stationMode: EntitySyncMode = "compare-and-fill";
        let lockerMode: EntitySyncMode = "compare-and-fill";

        try {
            cachedStations = await stationCacheRepository.findAll();
        } catch (error) {
            if (!isRedisAccessError(error)) {
                throw error;
            }

            stationMode = "rds-fallback-full-resync";
        }

        try {
            cachedLockers = await lockerCacheRepository.findAll();
        } catch (error) {
            if (!isDynamoAccessError(error)) {
                throw error;
            }

            lockerMode = "rds-fallback-full-resync";
        }

        return {
            stationProjections,
            lockerProjections,
            cachedStations,
            cachedLockers,
            stationMode,
            lockerMode,
        };
    }

    private async syncStationCandidates(
        stationCandidates: StationCacheDto[],
        stationDeleteCandidates: Array<{ stationId: string; version: number }>,
    ) {
        return Promise.allSettled([
            ...stationCandidates.map((projection) => stationCacheRepository.upsert(projection)),
            ...stationDeleteCandidates.map(({ stationId, version }) => stationCacheRepository.delete(stationId, version)),
        ]);
    }

    private async enqueueLockerCandidates(
        lockerCandidates: LockerCacheDto[],
        lockerDeleteCandidates: Array<{ lockerBoxId: string; version: number }>,
        correlationId?: string,
        actorId?: string | null,
        forceVersions?: Map<string, number>,
    ) {
        return Promise.allSettled([
            ...lockerCandidates.map((projection) =>
                enqueueLockerProjectionUpsert(
                    projection,
                    correlationId,
                    actorId,
                    forceVersions?.get(projection.lockerBoxId) ?? projection.version,
                )
            ),
            ...lockerDeleteCandidates.map(({ lockerBoxId, version }) =>
                enqueueLockerProjectionDelete(
                    lockerBoxId,
                    forceVersions?.get(lockerBoxId) ?? version,
                    correlationId,
                    actorId,
                )
            ),
        ]);
    }

    private resolveCacheStatus(results: PromiseSettledResult<void>[]) {
        return results.every((result) => result.status === "fulfilled")
            ? "SYNCED" as const
            : "FAILED" as const;
    }

    private buildForcedVersionMap(
        sourceLockers: LockerCacheDto[],
        cachedLockers: LockerCacheDto[],
        lockerDeleteCandidates: Array<{ lockerBoxId: string; version: number }>,
    ) {
        const cachedById = new Map(cachedLockers.map((item) => [item.lockerBoxId, item.version]));
        const forcedVersions = new Map<string, number>();

        for (const projection of sourceLockers) {
            const cachedVersion = cachedById.get(projection.lockerBoxId) ?? -1;
            forcedVersions.set(projection.lockerBoxId, Math.max(projection.version, cachedVersion + 1));
        }

        for (const candidate of lockerDeleteCandidates) {
            forcedVersions.set(candidate.lockerBoxId, candidate.version + 1);
        }

        return forcedVersions;
    }

    async reconcileAll(req: Request, res: Response) {
        const {
            stationProjections,
            lockerProjections,
            cachedStations,
            cachedLockers,
            stationMode,
            lockerMode,
        } = await this.loadCatalogState();

        const stationCandidates = stationMode === "compare-and-fill"
            ? getStationSyncCandidates(stationProjections, cachedStations)
            : stationProjections;

        const lockerCandidates = lockerMode === "compare-and-fill"
            ? getLockerSyncCandidates(lockerProjections, cachedLockers)
            : lockerProjections;

        const stationDeleteCandidates = stationMode === "compare-and-fill"
            ? getStationDeleteCandidates(stationProjections, cachedStations)
            : [];

        const lockerDeleteCandidates = lockerMode === "compare-and-fill"
            ? getLockerDeleteCandidates(lockerProjections, cachedLockers)
            : [];

        const [stationResults, lockerResults] = await Promise.all([
            this.syncStationCandidates(stationCandidates, stationDeleteCandidates),
            this.enqueueLockerCandidates(lockerCandidates, lockerDeleteCandidates, req.correlationId, req.user?.userId),
        ]);

        const stationCacheStatus = this.resolveCacheStatus(stationResults);
        const lockerCacheStatus = this.resolveCacheStatus(lockerResults);

        if (stationCacheStatus === "FAILED") {
            logger.error("Station cache reconcile finished with Redis write failures", {
                failedCount: stationResults.filter((result) => result.status === "rejected").length,
            });
        }

        if (lockerCacheStatus === "FAILED") {
            logger.error("Locker cache reconcile finished with queue enqueue failures", {
                failedCount: lockerResults.filter((result) => result.status === "rejected").length,
            });
        }

        logger.info("Catalog cache reconcile executed in backend queue mode for locker projections", {
            actorId: req.user?.userId,
            stationProjectionCount: stationProjections.length,
            cachedStationCount: cachedStations.length,
            lockerProjectionCount: lockerProjections.length,
            cachedLockerCount: cachedLockers.length,
            stationDriftCount: stationCandidates.length + stationDeleteCandidates.length,
            lockerDriftCount: lockerCandidates.length + lockerDeleteCandidates.length,
        });

        return sendSuccess(res, {
            mode: {
                stations: stationMode,
                lockers: lockerMode,
            },
            stations: {
                sourceCount: stationProjections.length,
                queuedCount: stationCandidates.length,
                deleteQueuedCount: stationDeleteCandidates.length,
            },
            lockers: {
                sourceCount: lockerProjections.length,
                queuedCount: lockerCandidates.length,
                deleteQueuedCount: lockerDeleteCandidates.length,
            },
        }, 202, {
            stationCacheStatus,
            lockerCacheStatus,
        });
    }

    async hardRefreshAll(req: Request, res: Response) {
        logger.info("Catalog hard refresh requested", {
            actorId: req.user?.userId,
            correlationId: req.correlationId,
        });

        const {
            stationProjections,
            lockerProjections,
            cachedStations,
            cachedLockers,
            stationMode,
            lockerMode,
        } = await this.loadCatalogState();

        const stationDeleteCandidates = stationMode === "compare-and-fill"
            ? getStationDeleteCandidates(stationProjections, cachedStations)
            : [];

        const lockerDeleteCandidates = lockerMode === "compare-and-fill"
            ? getLockerDeleteCandidates(lockerProjections, cachedLockers)
            : [];

        const forcedVersions = this.buildForcedVersionMap(lockerProjections, cachedLockers, lockerDeleteCandidates);

        const [stationResults, lockerResults] = await Promise.all([
            this.syncStationCandidates(stationProjections, stationDeleteCandidates),
            this.enqueueLockerCandidates(
                lockerProjections,
                lockerDeleteCandidates,
                req.correlationId,
                req.user?.userId,
                forcedVersions,
            ),
        ]);

        const stationCacheStatus = this.resolveCacheStatus(stationResults);
        const lockerCacheStatus = this.resolveCacheStatus(lockerResults);

        if (stationCacheStatus === "FAILED") {
            logger.error("Station hard refresh finished with Redis write failures", {
                actorId: req.user?.userId,
                correlationId: req.correlationId,
                failedCount: stationResults.filter((result) => result.status === "rejected").length,
            });
        }

        if (lockerCacheStatus === "FAILED") {
            logger.error("Locker hard refresh finished with queue enqueue failures", {
                actorId: req.user?.userId,
                correlationId: req.correlationId,
                failedCount: lockerResults.filter((result) => result.status === "rejected").length,
            });
        }

        logger.info("Catalog hard refresh executed from RDS source of truth through cache projection queue", {
            actorId: req.user?.userId,
            correlationId: req.correlationId,
            stationProjectionCount: stationProjections.length,
            cachedStationCount: cachedStations.length,
            lockerProjectionCount: lockerProjections.length,
            cachedLockerCount: cachedLockers.length,
            stationDeleteCount: stationDeleteCandidates.length,
            lockerDeleteCount: lockerDeleteCandidates.length,
            stationCacheStatus,
            lockerCacheStatus,
        });

        return sendSuccess(res, {
            mode: {
                stations: stationMode,
                lockers: lockerMode,
            },
            stations: {
                sourceCount: stationProjections.length,
                queuedCount: stationProjections.length,
                deleteQueuedCount: stationDeleteCandidates.length,
            },
            lockers: {
                sourceCount: lockerProjections.length,
                queuedCount: lockerProjections.length,
                deleteQueuedCount: lockerDeleteCandidates.length,
            },
        }, 202, {
            stationCacheStatus,
            lockerCacheStatus,
        });
    }

    async hardRefreshStation(req: Request, res: Response) {
        const stationId = req.params.id as string;

        logger.info("Station hard refresh requested", {
            actorId: req.user?.userId,
            correlationId: req.correlationId,
            stationId,
        });

        const [stationProjection, lockerProjections, cachedLockers] = await Promise.all([
            lockerCatalogProjectionService.getStationCacheProjection(stationId),
            lockerCatalogProjectionService.getLockerCacheProjectionsByStationId(stationId),
            lockerCacheRepository.findByStationId(stationId),
        ]);

        if (!stationProjection) {
            throw new HttpError(404, "Station not found");
        }

        const staleLockerDeletes = getLockerDeleteCandidates(lockerProjections, cachedLockers);
        const forcedVersions = this.buildForcedVersionMap(lockerProjections, cachedLockers, staleLockerDeletes);

        const [stationResults, lockerResults] = await Promise.all([
            this.syncStationCandidates([stationProjection], []),
            this.enqueueLockerCandidates(
                lockerProjections,
                staleLockerDeletes,
                req.correlationId,
                req.user?.userId,
                forcedVersions,
            ),
        ]);

        const stationCacheStatus = this.resolveCacheStatus(stationResults);
        const lockerCacheStatus = this.resolveCacheStatus(lockerResults);

        if (stationCacheStatus === "FAILED") {
            logger.error("Station hard refresh finished with Redis write failures", {
                actorId: req.user?.userId,
                correlationId: req.correlationId,
                stationId,
                failedCount: stationResults.filter((result) => result.status === "rejected").length,
            });
        }

        if (lockerCacheStatus === "FAILED") {
            logger.error("Station locker hard refresh finished with queue enqueue failures", {
                actorId: req.user?.userId,
                correlationId: req.correlationId,
                stationId,
                failedCount: lockerResults.filter((result) => result.status === "rejected").length,
            });
        }

        logger.info("Station hard refresh executed from RDS source of truth through cache projection queue", {
            actorId: req.user?.userId,
            correlationId: req.correlationId,
            stationId,
            lockerProjectionCount: lockerProjections.length,
            cachedLockerCount: cachedLockers.length,
            lockerDeleteCount: staleLockerDeletes.length,
            stationCacheStatus,
            lockerCacheStatus,
        });

        return sendSuccess(res, {
            stationId,
            lockers: {
                queuedCount: lockerProjections.length,
                deleteQueuedCount: staleLockerDeletes.length,
            },
        }, 202, {
            stationCacheStatus,
            lockerCacheStatus,
        });
    }
}

export const cacheSyncService = new CacheSyncService();
