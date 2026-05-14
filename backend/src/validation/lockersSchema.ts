import {z} from "zod";

export const PublicLockerStatusEnum = z.enum([
    "AVAILABLE",
    "RESERVED",
    "OCCUPIED",
    "EXPIRED"
]);

export const LockerStatusEnum = z.enum([
    "AVAILABLE",
    "RESERVED",
    "OCCUPIED",
    "FAULTY",
    "EXPIRED"
]);

export const TechnicalStatusEnum = z.enum([
    "ACTIVE",
    "INACTIVE",
    "MAINTENANCE",
    "FAULTY"
]);

export const LockerSizeEnum = z.enum([
    "S",
    "M",
    "L"
]);

export const createLockerSchema = z.object({
    body: z.object({
        stationId: z.string().uuid(),
        code: z.string(),
        size: LockerSizeEnum,
    }),
});

export const getLockersWithParamsSchema = z.object({
    query: z.object({
        stationId: z.string().uuid().optional(),
        size: LockerSizeEnum.optional(),
        status: PublicLockerStatusEnum.optional(),
        limit: z.coerce.number().int().positive().max(200).optional(),
        skip: z.coerce.number().int().nonnegative().optional(),
    })
});

export const getAdminLockersQuerySchema = z.object({
    query: z.object({
        stationId: z.string().uuid().optional(),
        city: z.string().trim().min(1).optional(),
        code: z.string().trim().min(1).optional(),
        size: LockerSizeEnum.optional(),
        status: LockerStatusEnum.optional(),
        techStatus: TechnicalStatusEnum.optional(),
        limit: z.coerce.number().int().positive().max(200).optional(),
        skip: z.coerce.number().int().nonnegative().optional(),
    }),
});

export const oneLockerSchema = z.object({
    params: z.object({
        id: z.string().uuid(),
    })
});

export const changeTechStatusLockerSchema = z.object({
    body: z.object({
        techStatus: TechnicalStatusEnum,
    }),
    params: z.object({
        id: z.string().uuid(),
    })
});

export const changeStatusLockerSchema = z.object({
    body: z.object({
        status: LockerStatusEnum,
    }),
    params: z.object({
        id: z.string().uuid(),
    })
});
