import {z} from "zod";

export const LockerSizeEnum = z.enum([
    "S",
    "M",
    "L"
]);

export const createPriceSchema = z.object({
    body: z.object({
        cityId: z.string().uuid(),
        size: LockerSizeEnum,
        pricePerHour: z.number()
    }),
});

export const changePriceSchema = z.object({
    body: z.object({
        pricePerHour: z.number()
    }),
    params: z.object({
        id: z.string().uuid(),
    })
});

export const pricingQuerySchema = z.object({
    query: z.object({
        cityId: z.string().uuid().optional(),
        size: LockerSizeEnum.optional(),
        limit: z.coerce.number().int().positive().max(200).optional(),
        skip: z.coerce.number().int().nonnegative().optional(),
    }),
});
