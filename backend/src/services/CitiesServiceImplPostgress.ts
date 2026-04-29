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
                        if (cityExist && cityExist.isActive === true) {
                            throw new HttpError(400, "City already exists");
                        }
                        if (cityExist && cityExist.isActive === false){
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
        return Promise.resolve(undefined);
    }



}

export const citiesService = new CitiesServiceImplPostgres();
