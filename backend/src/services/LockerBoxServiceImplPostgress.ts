import {Request, Response} from "express";
import {LockerStatus, TechnicalStatus} from "@prisma/client";

import {HttpError} from "../errorHandler/HttpError";
import {
    lockerCatalogProjectionService
} from "../repositories/prisma/LockerCatalogProjectionService";
import {logAudit} from "../utils/audit";
import {sendSuccess} from "../utils/response";

import {ActionType} from "./dto/operationDto";
import {idempotencyService} from "./IdempotencyService";
import {
    assertValidLockerStatusTransition,
    deleteLockerProjection,
    loadLockers,
    loadOneLocker,
    lockerMeta,
    LockerQuery,
    resolveLockerStateForTechStatus,
    syncLockerProjection,
    toLockerResponse,
} from "./lockerBox/lockerBoxService.helpers";
import {
    syncStationProjection
} from "./lockerStation/lockerStationService.helpers";
import {prismaService} from "./prismaService";

export class LockerBoxServiceImplPostgres {
    async getAllBoxes(req: Request, res: Response) {
        const lockers = await lockerCatalogProjectionService.getAllLockersAdminView();
        const stationId = req.query.stationId as string | undefined;
        const city = req.query.city as string | undefined;
        const code = req.query.code as string | undefined;
        const size = req.query.size as LockerQuery["size"] | undefined;
        const status = req.query.status as LockerQuery["status"] | undefined;
        const techStatus = req.query.techStatus as TechnicalStatus | undefined;
        const limit = req.query.limit === undefined ? undefined : Number(req.query.limit);
        const skip = Number(req.query.skip ?? 0);
        const filteredLockers = lockers
            .filter((locker) => !stationId || locker.stationId === stationId)
            .filter((locker) => !city || locker.station.city.toLowerCase().includes(city.toLowerCase()))
            .filter((locker) => !code || locker.code.toLowerCase().includes(code.toLowerCase()))
            .filter((locker) => !size || locker.size === size)
            .filter((locker) => !status || locker.status === status)
            .filter((locker) => !techStatus || locker.techStatus === techStatus);

        return sendSuccess(res, filteredLockers.slice(skip, limit === undefined ? undefined : skip + limit), 200, {
            limit,
            skip,
            total: filteredLockers.length,
        });
    }

    async createBox(req: Request, res: Response) {
        return idempotencyService.execute(
            req,
            res,
            "locker:create",
            req.body,
            async () => {
                const { stationId, code, size } = req.body as { stationId: string; code: string; size: "S" | "M" | "L" };

                try {
                    const result = await prismaService.$transaction(async (tx) => {
                        const stationExists = await tx.lockerStation.findFirst({ where: { stationId, isDeleted: false } });
                        if (!stationExists) throw new HttpError(404, "Station not found");

                        const boxExists = await tx.lockerBox.findFirst({ where: { stationId, code } });
                        if (boxExists) throw new HttpError(400, "Locker already exists");

                        const box = await tx.lockerBox.create({
                            data: {
                                stationId,
                                code,
                                size,
                                status: null,
                                techStatus: "INACTIVE",
                            },
                            select: {
                                lockerBoxId: true,
                                stationId: true,
                            },
                        });

                        return box;
                    });

                    const lockerProjection = await lockerCatalogProjectionService.getLockerCacheProjection(result.lockerBoxId);
                    if (!lockerProjection) {
                        throw new HttpError(500, "Failed to build locker cache projection after locker create");
                    }

                    const lockerCacheStatus = await syncLockerProjection(
                        lockerProjection,
                        req.correlationId,
                        req.user?.userId
                    );
                    const stationProjection = await lockerCatalogProjectionService.getStationCacheProjection(result.stationId);
                    const stationCacheStatus = stationProjection
                        ? await syncStationProjection(stationProjection)
                        : "FAILED";

                    await logAudit({
                        req,
                        action: ActionType.LOCKER_CREATE,
                        actorId: req.user?.userId,
                        entityId: result.lockerBoxId,
                        entityType: "LockerBox",
                    });

                    return {
                        body: { id: result.lockerBoxId, stationId: result.stationId },
                        meta: lockerMeta(stationCacheStatus, lockerCacheStatus),
                    };
                } catch (e: unknown) {
                    await logAudit({
                        req,
                        action: ActionType.LOCKER_CREATE_FAILED,
                        actorId: req.user?.userId,
                        entityId: stationId,
                        entityType: "LockerBox",
                        details: { reason: e instanceof Error ? e.message : "Unknown error" }
                    });

                    if (e instanceof HttpError) {
                        throw e;
                    }

                    throw new HttpError(500, "Failed to create locker");
                }
            }
        );
    }

    async getBoxes(req: Request, res: Response) {
        const stationId = req.query.stationId as string | undefined;
        const size = req.query.size as LockerQuery["size"] | undefined;
        const status = req.query.status as LockerQuery["status"] | undefined;
        const limit = req.query.limit === undefined ? undefined : Number(req.query.limit);
        const skip = Number(req.query.skip ?? 0);

        const lockers = await loadLockers();

        const result = lockers
            .filter((locker) => !stationId || locker.stationId === stationId)
            .filter((locker) => !size || locker.size === size)
            .filter((locker) => !status || locker.status === status)
            .filter((locker) => locker.station.status === "ACTIVE")
            .filter((locker) => locker.techStatus === "ACTIVE")
            .map(toLockerResponse);

        return sendSuccess(res, result.slice(skip, limit === undefined ? undefined : skip + limit), 200, {
            limit,
            skip,
            total: result.length,
        });
    }

    async getOneBox(req: Request, res: Response) {
        const lockerBoxId = req.params.id as string;
        const locker = await loadOneLocker(lockerBoxId);

        if (!locker) {
            throw new HttpError(404, "Locker doesn't exist");
        }

        if (locker.station.status !== "ACTIVE" || locker.techStatus !== "ACTIVE") {
            throw new HttpError(404, "Locker doesn't exist");
        }

        return sendSuccess(res, toLockerResponse(locker));
    }

    async getOneBoxAdmin(req: Request, res: Response) {
        const lockerBoxId = req.params.id as string;
        const locker = await lockerCatalogProjectionService.getLockerAdminProjection(lockerBoxId);

        if (!locker) {
            throw new HttpError(404, "Locker doesn't exist");
        }

        return sendSuccess(res, locker);
    }

    async changeBoxStatus(req: Request, res: Response) {
        const lockerBoxId = req.params.id as string;
        const status = req.body.status;

        return idempotencyService.execute(
            req,
            res,
            `locker:status:${lockerBoxId}`,
            req.body,
            async () => {
                try {
                    const result = await prismaService.$transaction(async (tx) => {
                        const locker = await tx.lockerBox.findUnique({
                            where: { lockerBoxId },
                            include: {
                                station: {
                                    select: {
                                        status: true,
                                    },
                                },
                            },
                        });
                        if (!locker) throw new HttpError(404, "Locker doesn't exist");
                        if (locker.isDeleted) throw new HttpError(400, "Locker deleted");
                        assertValidLockerStatusTransition({
                            nextStatus: status as LockerStatus,
                            currentStatus: locker.status,
                            techStatus: locker.techStatus,
                            stationStatus: locker.station.status,
                        });

                        const updatedLocker = await tx.lockerBox.update({
                            where: { lockerBoxId, isDeleted: false },
                            data: { status },
                            select: {
                                lockerBoxId: true,
                                stationId: true,
                            },
                        });

                        return updatedLocker;
                    });

                    const currentProjection = await lockerCatalogProjectionService.getLockerCacheProjection(lockerBoxId);
                    if (!currentProjection) throw new HttpError(500, "Failed to build locker cache projection after status change");

                    const nextProjection = {
                        ...currentProjection,
                        status: status as LockerStatus,
                        version: currentProjection.version + 1,
                        lastStatusChangedAt: new Date().toISOString(),
                    };

                    const lockerCacheStatus = await syncLockerProjection(
                        nextProjection,
                        req.correlationId,
                        req.user?.userId
                    );
                    const stationProjection = await lockerCatalogProjectionService.getStationCacheProjection(result.stationId);
                    const stationCacheStatus = stationProjection
                        ? await syncStationProjection(stationProjection)
                        : "FAILED";

                    await logAudit({
                        req,
                        action: ActionType.LOCKER_UPDATE_STATUS,
                        actorId: req.user?.userId,
                        entityId: lockerBoxId,
                        entityType: "LockerBox",
                    });

                    return {
                        body: { lockerBoxId, stationId: result.stationId, status },
                        meta: lockerMeta(stationCacheStatus, lockerCacheStatus),
                    };
                } catch (e: unknown) {
                    await logAudit({
                        req,
                        action: ActionType.LOCKER_UPDATE_STATUS_FAILED,
                        actorId: req.user?.userId,
                        entityId: lockerBoxId,
                        entityType: "LockerBox",
                        details: { reason: e instanceof Error ? e.message : "Unknown error" }
                    });

                    if (e instanceof HttpError) {
                        throw e;
                    }

                    throw new HttpError(500, "Failed to update locker status");
                }
            }
        );
    }

    async changeBoxTechStatus(req: Request, res: Response) {
        const lockerBoxId = req.params.id as string;
        const techStatus = req.body.techStatus as TechnicalStatus;

        return idempotencyService.execute(
            req,
            res,
            `locker:tech-status:${lockerBoxId}`,
            req.body,
            async () => {
                try {
                    const result = await prismaService.$transaction(async (tx) => {
                        const locker = await tx.lockerBox.findUnique({
                            where: { lockerBoxId },
                        });
                        if (!locker) throw new HttpError(404, "Locker doesn't exist");
                        if (locker.isDeleted) throw new HttpError(400, "Locker deleted");
                        if (locker.techStatus === techStatus) {
                            throw new HttpError(
                                400,
                                `Cannot change from ${locker.techStatus} to ${techStatus}`,
                                "INVALID_STATUS_TRANSITION"
                            );
                        }

                        const runtimeState = resolveLockerStateForTechStatus({
                            currentStatus: locker.status,
                            nextTechStatus: techStatus,
                        });

                        const updatedLocker = await tx.lockerBox.update({
                            where: { lockerBoxId, isDeleted: false },
                            data: {
                                techStatus,
                                status: runtimeState.nextStatus === null
                                    ? { set: null }
                                    : runtimeState.nextStatus,
                                ...(runtimeState.statusChanged
                                    ? { lastStatusChangedAt: new Date() }
                                    : {}),
                            },
                            select: {
                                lockerBoxId: true,
                                stationId: true,
                                code: true,
                                size: true,
                                status: true,
                                techStatus: true,
                            },
                        });

                        return updatedLocker;
                    });

                    const currentProjection = await lockerCatalogProjectionService.getLockerCacheProjection(lockerBoxId);
                    if (!currentProjection) throw new HttpError(500, "Failed to build locker cache projection after tech status change");

                    const nextProjection = {
                        ...currentProjection,
                        status: result.status,
                        techStatus,
                        version: currentProjection.version + 1,
                        ...(result.status !== currentProjection.status
                            ? {
                                lastStatusChangedAt: new Date().toISOString(),
                            }
                            : {}),
                    };

                    const lockerCacheStatus = await syncLockerProjection(
                        nextProjection,
                        req.correlationId,
                        req.user?.userId
                    );
                    const stationProjection = await lockerCatalogProjectionService.getStationCacheProjection(result.stationId);
                    const stationCacheStatus = stationProjection
                        ? await syncStationProjection(stationProjection)
                        : "FAILED";

                    await logAudit({
                        req,
                        action: ActionType.LOCKER_UPDATE_TECH_STATUS,
                        actorId: req.user?.userId,
                        entityId: lockerBoxId,
                        entityType: "LockerBox",
                        details: {
                            techStatus,
                            status: result.status,
                        },
                    });

                    return {
                        body: {
                            lockerBoxId,
                            stationId: result.stationId,
                            code: result.code,
                            size: result.size,
                            status: result.status,
                            techStatus: result.techStatus
                        },
                        meta: lockerMeta(stationCacheStatus, lockerCacheStatus),
                    };
                } catch (e: unknown) {
                    await logAudit({
                        req,
                        action: ActionType.LOCKER_UPDATE_TECH_STATUS_FAILED,
                        actorId: req.user?.userId,
                        entityId: lockerBoxId,
                        entityType: "LockerBox",
                        details: {
                            techStatus,
                            reason: e instanceof Error ? e.message : "Unknown error"
                        }
                    });

                    if (e instanceof HttpError) {
                        throw e;
                    }

                    throw new HttpError(500, "Failed to update locker tech status");
                }
            }
        );
    }

    async deleteBox(req: Request, res: Response) {
        const lockerBoxId = req.params.id as string;

        return idempotencyService.execute(
            req,
            res,
            `locker:delete:${lockerBoxId}`,
            { lockerBoxId },
            async () => {
                try {
                    const result = await prismaService.$transaction(async (tx) => {
                        const locker = await tx.lockerBox.findUnique({ where: { lockerBoxId } });
                        if (!locker) throw new HttpError(404, "Locker doesn't exist");
                        if (locker.isDeleted) throw new HttpError(400, "Locker already deleted");

                        const deletedLocker = await tx.lockerBox.update({
                            where: { lockerBoxId },
                            data: {
                                isDeleted: true,
                                deletedAt: new Date(),
                            },
                            select: {
                                lockerBoxId: true,
                                stationId: true,
                            },
                        });

                        return deletedLocker;
                    });

                    const lockerCacheStatus = await deleteLockerProjection(
                        lockerBoxId,
                        0,
                        req.correlationId,
                        req.user?.userId
                    );
                    const stationProjection = await lockerCatalogProjectionService.getStationCacheProjection(result.stationId);
                    const stationCacheStatus = stationProjection
                        ? await syncStationProjection(stationProjection)
                        : "FAILED";

                    await logAudit({
                        req,
                        action: ActionType.LOCKER_DELETE,
                        actorId: req.user?.userId,
                        entityId: lockerBoxId,
                        entityType: "LockerBox",
                    });

                    return {
                        body: { message: "Locker deleted", lockerBoxId, stationId: result.stationId },
                        meta: lockerMeta(stationCacheStatus, lockerCacheStatus),
                    };
                } catch (e: unknown) {
                    await logAudit({
                        req,
                        action: ActionType.LOCKER_DELETE_FAILED,
                        actorId: req.user?.userId,
                        entityId: lockerBoxId,
                        entityType: "LockerBox",
                        details: { reason: e instanceof Error ? e.message : "Unknown error" }
                    });

                    if (e instanceof HttpError) {
                        throw e;
                    }

                    throw new HttpError(500, "Failed to delete locker");
                }
            }
        );
    }

    async resyncLockerCache(req: Request, res: Response) {
        const lockerBoxId = req.params.id as string;
        const projection = await lockerCatalogProjectionService.getLockerCacheProjection(lockerBoxId);

        if (!projection) {
            throw new HttpError(404, "Locker not found");
        }

        const lockerCacheStatus = await syncLockerProjection(
            projection,
            req.correlationId,
            req.user?.userId
        );

        return sendSuccess(res, { lockerBoxId }, 202, {
            lockerCacheStatus,
        });
    }

    async hardResyncLockerCache(req: Request, res: Response) {
        const lockerBoxId = req.params.id as string;
        const [projection, cachedLocker] = await Promise.all([
            lockerCatalogProjectionService.getLockerCacheProjection(lockerBoxId),
            loadOneLocker(lockerBoxId),
        ]);

        if (!projection) {
            throw new HttpError(404, "Locker not found");
        }

        const forcedVersion = Math.max(projection.version, (cachedLocker?.version ?? -1) + 1);
        const lockerCacheStatus = await syncLockerProjection(
            projection,
            req.correlationId,
            req.user?.userId,
            forcedVersion,
        );

        return sendSuccess(res, {
            lockerBoxId,
            queuedVersion: forcedVersion,
        }, 202, {
            lockerCacheStatus,
        });
    }
}

export const boxService = new LockerBoxServiceImplPostgres();
