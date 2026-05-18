import { Prisma } from "@prisma/client";

import { pricingService } from "../../../src/services/PricingServiceImplPostgres";
import { prismaService } from "../../../src/services/prismaService";
import { idempotencyService } from "../../../src/services/IdempotencyService";
import { lockerCatalogProjectionService } from "../../../src/repositories/prisma/LockerCatalogProjectionService";

import * as auditModule from "../../../src/utils/audit";

describe("PricingServiceImplPostgres", () => {

    const createMockReq = (overrides = {}) => ({
        body: {},
        params: {},
        query: {},
        correlationId: "corr-1",
        user: {
            userId: "admin-1",
        },
        ...overrides,
    });

    const createMockRes = () => ({
        setHeader: jest.fn(),
        json: jest.fn(),
    });

    const mockIdempotencyExecute = () => {
        jest.spyOn(idempotencyService, "execute")
            .mockImplementation((async (
                _req: any,
                _res: any,
                _scope: any,
                _payload: any,
                handler: any
            ) => {
                return handler();
            }) as any);
    };

    beforeEach(() => {
        jest.clearAllMocks();

        mockIdempotencyExecute();

        jest.spyOn(auditModule, "logAudit")
            .mockResolvedValue(undefined);

        jest.spyOn(
            lockerCatalogProjectionService,
            "getStationCacheProjectionsByCityId"
        ).mockResolvedValue([]);

        jest.spyOn(
            lockerCatalogProjectionService,
            "getLockerCacheProjectionsByCityIdAndSize"
        ).mockResolvedValue([]);
    });

    // =========================================================
    // CREATE PRICE
    // =========================================================

    describe("createPrice", () => {

        it("should create price successfully", async () => {

            const req = createMockReq({
                body: {
                    cityId: "city-1",
                    size: "M",
                    pricePerHour: 10,
                },
            });

            const res = createMockRes();

            jest.spyOn(prismaService, "$transaction")
                .mockImplementation(async (callback: any) => {

                    return callback({
                        city: {
                            findUnique: jest.fn().mockResolvedValue({
                                cityId: "city-1",
                            }),
                        },

                        pricing: {
                            findUnique: jest.fn().mockResolvedValue(null),

                            create: jest.fn().mockResolvedValue({
                                priceId: "price-1",
                                cityId: "city-1",
                                size: "M",
                            }),
                        },
                    });
                });

            const result = await pricingService.createPrice(req as any, res as any);

            expect(result).toEqual({
                statusCode: 201,

                body: {
                    id: "price-1",
                },

                meta: {
                    stationCacheStatus: "SYNCED",
                    lockerCacheStatus: "SYNCED",
                    affectedStations: 0,
                    affectedLockers: 0,
                },
            });

            expect(auditModule.logAudit).toHaveBeenCalled();
        });

        it("should throw 404 if city not found", async () => {

            const req = createMockReq({
                body: {
                    cityId: "missing-city",
                    size: "M",
                    pricePerHour: 10,
                },
            });

            const res = createMockRes();

            jest.spyOn(prismaService, "$transaction")
                .mockImplementation(async (callback: any) => {

                    return callback({
                        city: {
                            findUnique: jest.fn().mockResolvedValue(null),
                        },

                        pricing: {},
                    });
                });

            await expect(
                pricingService.createPrice(req as any, res as any)
            ).rejects.toThrow("City not found");
        });

        it("should throw 400 if price already exists", async () => {

            const req = createMockReq({
                body: {
                    cityId: "city-1",
                    size: "M",
                    pricePerHour: 10,
                },
            });

            const res = createMockRes();

            jest.spyOn(prismaService, "$transaction")
                .mockImplementation(async (callback: any) => {

                    return callback({
                        city: {
                            findUnique: jest.fn().mockResolvedValue({
                                cityId: "city-1",
                            }),
                        },

                        pricing: {
                            findUnique: jest.fn().mockResolvedValue({
                                priceId: "existing-price",
                            }),
                        },
                    });
                });

            await expect(
                pricingService.createPrice(req as any, res as any)
            ).rejects.toThrow("Price already exists");
        });

        it("should throw 500 on unknown db error", async () => {

            const req = createMockReq({
                body: {
                    cityId: "city-1",
                    size: "M",
                    pricePerHour: 10,
                },
            });

            const res = createMockRes();

            jest.spyOn(prismaService, "$transaction")
                .mockRejectedValue(new Error("DB crashed"));

            await expect(
                pricingService.createPrice(req as any, res as any)
            ).rejects.toThrow("Failed to create price");
        });

        it("should write failed audit log on create failure", async () => {

            const req = createMockReq({
                body: {
                    cityId: "city-1",
                    size: "M",
                    pricePerHour: 10,
                },
            });

            const res = createMockRes();

            jest.spyOn(prismaService, "$transaction")
                .mockRejectedValue(new Error("DB crashed"));

            await expect(
                pricingService.createPrice(req as any, res as any)
            ).rejects.toThrow();

            expect(auditModule.logAudit).toHaveBeenCalled();
        });

    });

    // =========================================================
    // CHANGE PRICE
    // =========================================================

    describe("changePrice", () => {

        it("should update price successfully", async () => {

            const req = createMockReq({
                params: {
                    id: "price-1",
                },

                body: {
                    pricePerHour: 15,
                },
            });

            const res = createMockRes();

            jest.spyOn(prismaService, "$transaction")
                .mockImplementation(async (callback: any) => {

                    return callback({

                        pricing: {

                            findUnique: jest.fn().mockResolvedValue({
                                priceId: "price-1",
                            }),

                            update: jest.fn().mockResolvedValue({
                                priceId: "price-1",
                                cityId: "city-1",
                                size: "M",
                                pricePerHour: new Prisma.Decimal(15),
                            }),
                        },
                    });
                });

            const result = await pricingService.changePrice(req as any, res as any);

            expect(result).toEqual({
                statusCode: 200,

                body: {
                    newPrice: {
                        priceId: "price-1",
                        cityId: "city-1",
                        size: "M",
                        pricePerHour: 15,
                    },
                },

                meta: {
                    stationCacheStatus: "SYNCED",
                    lockerCacheStatus: "SYNCED",
                    affectedStations: 0,
                    affectedLockers: 0,
                },
            });

            expect(auditModule.logAudit).toHaveBeenCalled();
        });

        it("should throw 404 if price not found", async () => {

            const req = createMockReq({
                params: {
                    id: "missing-price",
                },

                body: {
                    pricePerHour: 15,
                },
            });

            const res = createMockRes();

            jest.spyOn(prismaService, "$transaction")
                .mockImplementation(async (callback: any) => {

                    return callback({
                        pricing: {
                            findUnique: jest.fn().mockResolvedValue(null),
                        },
                    });
                });

            await expect(
                pricingService.changePrice(req as any, res as any)
            ).rejects.toThrow("Price not found");
        });

        it("should throw 500 on unknown update error", async () => {

            const req = createMockReq({
                params: {
                    id: "price-1",
                },

                body: {
                    pricePerHour: 15,
                },
            });

            const res = createMockRes();

            jest.spyOn(prismaService, "$transaction")
                .mockRejectedValue(new Error("DB crashed"));

            await expect(
                pricingService.changePrice(req as any, res as any)
            ).rejects.toThrow("Failed to update price");
        });

    });

    // =========================================================
    // GET ALL PRICES
    // =========================================================

    describe("getAllPrices", () => {

        it("should convert Decimal to Number", async () => {

            const req = createMockReq({
                query: {},
            });

            const res = createMockRes();

            jest.spyOn(prismaService, "$transaction")
                .mockResolvedValue([
                    [
                        {
                            priceId: "1",

                            pricePerHour: new Prisma.Decimal(10.5),

                            city: {
                                code: "TLV",
                                name: "Tel Aviv",
                            },
                        },
                    ],

                    1,
                ] as any);

            await pricingService.getAllPrices(req as any, res as any);

            expect(res.json).toHaveBeenCalledWith([
                expect.objectContaining({
                    pricePerHour: 10.5,
                }),
            ]);
        });

        it("should set pagination headers", async () => {

            const req = createMockReq({
                query: {
                    limit: "10",
                    skip: "20",
                },
            });

            const res = createMockRes();

            jest.spyOn(prismaService, "$transaction")
                .mockResolvedValue([
                    [],
                    100,
                ] as any);

            await pricingService.getAllPrices(req as any, res as any);

            expect(res.setHeader).toHaveBeenCalledWith("x-total-count", 100);

            expect(res.setHeader).toHaveBeenCalledWith("x-skip", 20);

            expect(res.setHeader).toHaveBeenCalledWith("x-limit", 10);
        });

        it("should not set x-limit header if limit not provided", async () => {

            const req = createMockReq({
                query: {},
            });

            const res = createMockRes();

            jest.spyOn(prismaService, "$transaction")
                .mockResolvedValue([
                    [],
                    0,
                ] as any);

            await pricingService.getAllPrices(req as any, res as any);

            expect(res.setHeader).not.toHaveBeenCalledWith(
                "x-limit",
                expect.anything()
            );
        });

        it("should return empty array", async () => {

            const req = createMockReq({
                query: {},
            });

            const res = createMockRes();

            jest.spyOn(prismaService, "$transaction")
                .mockResolvedValue([
                    [],
                    0,
                ] as any);

            await pricingService.getAllPrices(req as any, res as any);

            expect(res.json).toHaveBeenCalledWith([]);
        });

    });

});