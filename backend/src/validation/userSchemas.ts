import { Role } from "@prisma/client";
import { z } from "zod";

export const adminUsersQuerySchema = z.object({
    query: z.object({
        role: z.nativeEnum(Role).optional(),
        email: z.string().trim().min(1).optional(),
        phone: z.string().trim().min(1).optional(),
        name: z.string().trim().min(1).optional(),
        includeDeleted: z.coerce.boolean().optional(),
        limit: z.coerce.number().int().positive().max(200).optional(),
        skip: z.coerce.number().int().nonnegative().optional(),
    }),
});
