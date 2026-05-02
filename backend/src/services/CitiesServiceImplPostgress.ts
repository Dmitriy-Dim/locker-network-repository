import {Request, Response} from "express";

import {HttpError} from "../errorHandler/HttpError";
import {logAudit} from "../utils/audit";
import {sendSuccess} from "../utils/response";
import {lockerCatalogProjectionService} from "../repositories/prisma/LockerCatalogProjectionService";

import {prismaService} from "./prismaService";
import {idempotencyService} from "./IdempotencyService";
import {ActionType} from "./dto/operationDto";
import {
    loadCitiesWithFallback,
    syncCityProjection
} from "./lockerCities/lockerCitiesService.helpers";


export class CitiesServiceImplPostgres {

    async getAllCities(req: Request, res: Response) {
        const cities = await loadCitiesWithFallback();
        return sendSuccess(res, cities);
    }

    async createCities(req: Request, res: Response) {
        return idempotencyService.execute(
            req,
            res,
            "city:create",
            req.body,
            async () => {
                const {code, name} = req.body;

                try {
                    const result = await prismaService.$transaction(async (tx) => {
                        const cityExist = await tx.city.findUnique({
                            where: {code}
                        });
                        if (cityExist && cityExist.isActive) {
                            throw new HttpError(400, "City already exists");
                        }
                        if (cityExist && !cityExist.isActive){
                            const city = await tx.city.update({
                                where: {code},
                                data: {isActive: true},
                                select: {cityId: true},
                            })
                            return {city}
                        }
                        const city = await tx.city.create({
                                data: {
                                    code,
                                    name
                                },
                                select: {
                                    cityId: true
                                }
                            }
                        )
                       return {city};
                });
                    const cityProjection = await lockerCatalogProjectionService.getCityCacheProjection(result.city.cityId);
                    const cityCacheStatus = cityProjection
                        ? await syncCityProjection(cityProjection)
                        : "FAILED";

                    await logAudit({
                        req,
                        action: ActionType.CITY_CREATE,
                        actorId: req.user?.userId,
                        entityId: result.city.cityId,
                        entityType: "City",
                    });
                    return {
                        statusCode: 201,
                        body: {id: result.city.cityId },
                        meta: {cityCacheStatus},
                    };
                } catch (e) {
                    await logAudit({
                        req,
                        action: ActionType.CITY_CREATE_FAILED,
                        actorId: req.user?.userId,
                        entityId: "undefined",
                        entityType: "City",
                        details: { reason: e instanceof Error ? e.message : "Unknown error" }
                    });

                    if (e instanceof HttpError) {
                        throw e;
                    }
                    throw new HttpError(500, "Failed to create city");
                }
            }
        )

    }


    async deleteCities(req: Request, res: Response) {
        return idempotencyService.execute(
            req,
            res,
            "city:delete",
            { cityId: req.params.id },
            async () => {
                const rawCityId = req.params.id;
                const cityId = Array.isArray(rawCityId)
                    ? rawCityId[0]
                    : rawCityId;

                if (!cityId) {
                    throw new HttpError(400, "City id is required");
                }

                try {
                    const result = await prismaService.$transaction(async (tx) => {
                        const cityExist = await tx.city.findUnique({
                            where: { cityId },
                            select: {
                                cityId: true,
                                code: true,
                                name: true,
                                isActive: true,
                            },
                        });

                        if (!cityExist) {
                            throw new HttpError(404, "City not found");
                        }

                        if (!cityExist.isActive) {
                            return { city: cityExist };
                        }

                        const city = await tx.city.update({
                            where: { cityId },
                            data: {
                                isActive: false,
                            },
                            select: {
                                cityId: true,
                                code: true,
                                name: true,
                                isActive: true,
                            },
                        });

                        return { city };
                    });

                    const cityProjection = await lockerCatalogProjectionService.getCityCacheProjection(result.city.cityId);
                    const cityCacheStatus = cityProjection
                        ? await syncCityProjection(cityProjection)
                        : "SYNCED";

                    await logAudit({
                        req,
                        action: ActionType.CITY_DELETE,
                        actorId: req.user?.userId,
                        entityId: result.city.cityId,
                        entityType: "City",
                    });

                    return {
                        statusCode: 200,
                        body: {
                            id: result.city.cityId,
                            isActive: result.city.isActive,
                        },
                        meta: {
                            cityCacheStatus,
                        },
                    };
                } catch (e) {
                    await logAudit({
                        req,
                        action: ActionType.CITY_DELETE_FAILED,
                        actorId: req.user?.userId,
                        entityId: cityId,
                        entityType: "City",
                        details: {
                            reason: e instanceof Error ? e.message : "Unknown error",
                        },
                    });

                    if (e instanceof HttpError) {
                        throw e;
                    }

                    throw new HttpError(500, "Failed to delete city");
                }
            }
        );
    }


    async updateCities(req: Request, res: Response) {
        return idempotencyService.execute(
            req,
            res,
            "city:update",
            { cityId: req.params.id, body: req.body },
            async () => {
                const rawCityId = req.params.id;
                const cityId = Array.isArray(rawCityId)
                    ? rawCityId[0]
                    : rawCityId;

                if (!cityId) {
                    throw new HttpError(400, "City id is required");
                }

                const { code, name } = req.body as {
                    code?: string;
                    name?: string;
                };

                const updateData: {
                    code?: string;
                    name?: string;
                } = {};

                if (typeof code === "string") {
                    updateData.code = code;
                }

                if (typeof name === "string") {
                    updateData.name = name;
                }

                if (!updateData.code && !updateData.name) {
                    throw new HttpError(400, "City code or name is required");
                }

                try {
                    const result = await prismaService.$transaction(async (tx) => {
                        const cityExist = await tx.city.findUnique({
                            where: { cityId },
                            select: {
                                cityId: true,
                                code: true,
                                name: true,
                                isActive: true,
                            },
                        });

                        if (!cityExist || !cityExist.isActive) {
                            throw new HttpError(404, "City not found");
                        }

                        const updatedCity = await tx.city.update({
                            where: { cityId },
                            data: updateData,
                            select: {
                                cityId: true,
                                code: true,
                                name: true,
                                isActive: true,
                            },
                        });

                        return {
                            oldCity: cityExist,
                            updatedCity,
                        };
                    });

                    const cityProjection = await lockerCatalogProjectionService.getCityCacheProjection(
                        result.updatedCity.cityId
                    );

                    const cityCacheStatus = cityProjection
                        ? await syncCityProjection(cityProjection)
                        : "SYNCED";

                    await logAudit({
                        req,
                        action: ActionType.CITY_UPDATE,
                        actorId: req.user?.userId,
                        entityId: result.updatedCity.cityId,
                        entityType: "City",
                        details: {
                            old: {
                                code: result.oldCity.code,
                                name: result.oldCity.name,
                            },
                            new: {
                                code: result.updatedCity.code,
                                name: result.updatedCity.name,
                            },
                        },
                    });

                    return {
                        statusCode: 200,
                        body: {
                            id: result.updatedCity.cityId,
                            old: {
                                code: result.oldCity.code,
                                name: result.oldCity.name,
                            },
                            new: {
                                code: result.updatedCity.code,
                                name: result.updatedCity.name,
                            },
                        },
                        meta: {
                            cityCacheStatus,
                        },
                    };
                } catch (e) {
                    await logAudit({
                        req,
                        action: ActionType.CITY_UPDATE_FAILED,
                        actorId: req.user?.userId,
                        entityId: cityId,
                        entityType: "City",
                        details: {
                            reason: e instanceof Error ? e.message : "Unknown error",
                        },
                    });

                    if (e instanceof HttpError) {
                        throw e;
                    }

                    throw new HttpError(500, "Failed to update city");
                }
            }
        );
    }
}

export const citiesService = new CitiesServiceImplPostgres();
