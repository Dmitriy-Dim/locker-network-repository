import {Request, Response} from "express";

import {HttpError} from "../errorHandler/HttpError";
import {lockerCatalogProjectionService} from "../repositories/prisma/LockerCatalogProjectionService";
import {logAudit} from "../utils/audit";

import {prismaService} from "./prismaService";
import {idempotencyService} from "./IdempotencyService";
import {ActionType} from "./dto/operationDto";
import {enqueueLockerProjectionUpsert} from "./sqsService";
import {syncStationProjection} from "./lockerStation/lockerStationService.helpers";

type LockerSize = "S" | "M" | "L";

export class PricingServiceImplPostgres {
    private resolveCacheStatus(results: Array<"SYNCED" | "DEFERRED" | "FAILED">) {
        return results.every((result) => result !== "FAILED")
            ? "SYNCED" as const
            : "FAILED" as const;
    }

    private async syncCatalogCacheAfterPriceChange(
        cityId: string,
        size: LockerSize,
        correlationId?: string,
        actorId?: string | null
    ) {
        const [stationProjections, lockerProjections] = await Promise.all([
            lockerCatalogProjectionService.getStationCacheProjectionsByCityId(cityId),
            lockerCatalogProjectionService.getLockerCacheProjectionsByCityIdAndSize(cityId, size),
        ]);

        const stationResults = await Promise.all(
            stationProjections.map((projection) => syncStationProjection(projection))
        );

        const lockerResults = await Promise.allSettled(
            lockerProjections.map((projection) =>
                enqueueLockerProjectionUpsert(
                    projection,
                    correlationId,
                    actorId,
                    projection.version + 1,
                )
            )
        );

        const lockerCacheStatus = lockerProjections.length === 0
            ? "SYNCED" as const
            : lockerResults.every((result) => result.status === "fulfilled")
            ? "DEFERRED" as const
            : "FAILED" as const;

        return {
            stationCacheStatus: this.resolveCacheStatus(stationResults),
            lockerCacheStatus,
            affectedStations: stationProjections.length,
            affectedLockers: lockerProjections.length,
        };
    }


    async getAllPrices(req: Request, res: Response) {
        const cityId = req.query.cityId as string;
        const size = req.query.size as LockerSize;

        const prices = await prismaService.pricing.findMany({
            where: {
                ...(cityId && { cityId }),
                ...(size && { size }),
            },
            include: {
                city: {
                    select: { code: true, name: true },
                },
            },
        });


        const result = prices.map(p => ({
            ...p,
            pricePerHour: Number(p.pricePerHour),
        }));

        return res.json(result);
    }

    async createPrice(req: Request, res: Response) {
        return idempotencyService.execute(
            req,
            res,
            "price:create",
            req.body,
            async () => {
                const {pricePerHour, cityId, size} = req.body as {cityId: string, size: "S" | "M" | "L", pricePerHour: number};

                try {
                    const result = await prismaService.$transaction(async (tx) => {
                        const city = await tx.city.findUnique({
                            where: {cityId}
                        })
                        if (!city){
                            throw new HttpError(404, "City not found");
                        }
                        const priceExist = await tx.pricing.findUnique({
                            where: {
                                cityId_size : {cityId, size}}
                        });
                        if (priceExist) {
                            throw new HttpError(400, "Price already exists");
                        }
                        const price = await tx.pricing.create({
                                data: {
                                    cityId,
                                    pricePerHour,
                                    size
                                },
                                select: {
                                    priceId: true,
                                    cityId: true,
                                    size: true,
                                }
                            }
                        )
                        return {price};
                    });
                    const cacheSync = await this.syncCatalogCacheAfterPriceChange(
                        result.price.cityId,
                        result.price.size,
                        req.correlationId,
                        req.user?.userId,
                    );
                    await logAudit({
                        req,
                        action: ActionType.PRICE_CREATE,
                        actorId: req.user?.userId,
                        entityId: result.price.priceId,
                        entityType: "Pricing",
                    });
                    return {
                        statusCode: 201,
                        body: {id: result.price.priceId },
                        meta: cacheSync,
                    };
                } catch (e) {
                    await logAudit({
                        req,
                        action: ActionType.PRICE_CREATE_FAILED,
                        actorId: req.user?.userId,
                        entityId: "undefined",
                        entityType: "Pricing",
                        details: { reason: e instanceof Error ? e.message : "Unknown error" }
                    });

                    if (e instanceof HttpError) {
                        throw e;
                    }
                    throw new HttpError(500, "Failed to create price");
                }
            }
        )
    }

    async changePrice(req: Request, res: Response) {
        return idempotencyService.execute(
            req,
            res,
            "price:changePrice",
            req.body,
            async () => {
                const {pricePerHour} = req.body as {pricePerHour: number};
                const priceId = req.params.id as string;

                try {
                    const result = await prismaService.$transaction(async (tx) => {
                        const priceExist = await tx.pricing.findUnique({
                            where: {
                                priceId,
                            }
                        });
                        if (!priceExist) {
                            throw new HttpError(404, "Price not found");
                        }
                        const price = await tx.pricing.update({
                            where: {priceId},
                                data: {
                                    pricePerHour,
                                },
                                select: {
                                    priceId: true,
                                    cityId: true,
                                    size: true,
                                    pricePerHour: true
                                }
                            }
                        )
                        return {price};
                    });
                    const cacheSync = await this.syncCatalogCacheAfterPriceChange(
                        result.price.cityId,
                        result.price.size,
                        req.correlationId,
                        req.user?.userId,
                    );
                    await logAudit({
                        req,
                        action: ActionType.PRICE_UPDATE,
                        actorId: req.user?.userId,
                        entityId: result.price.priceId,
                        entityType: "Pricing",
                    });
                    return {
                        statusCode: 200,
                        body: {newPrice: {
                                ...result.price,
                                pricePerHour: Number(result.price.pricePerHour),
                            }},
                        meta: cacheSync,
                    };
                } catch (e) {
                    await logAudit({
                        req,
                        action: ActionType.PRICE_UPDATE_FAILED,
                        actorId: req.user?.userId,
                        entityId: "undefined",
                        entityType: "Pricing",
                        details: { reason: e instanceof Error ? e.message : "Unknown error" }
                    });

                    if (e instanceof HttpError) {
                        throw e;
                    }
                    throw new HttpError(500, "Failed to update price");
                }
            }
        )
    }



}

export const pricingService = new PricingServiceImplPostgres();
