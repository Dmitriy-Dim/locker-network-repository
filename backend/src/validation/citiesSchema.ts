
import {z} from "zod";

export const createCitySchema = z.object({
    body: z.object({
        code: z.string().min(2).max(4),
        name: z.string(),
    }),
});

export const citiesQuerySchema = z.object({
    query: z.object({
        code: z.string().trim().min(1).optional(),
        name: z.string().trim().min(1).optional(),
        limit: z.coerce.number().int().positive().max(200).optional(),
        skip: z.coerce.number().int().nonnegative().optional(),
    }),
});
