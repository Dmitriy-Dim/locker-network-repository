import { z } from "zod";

export const StationStatusEnum = z.enum([
    "READY",
    "ACTIVE",
    "INACTIVE",
    "MAINTENANCE",
]);

export const createStationSchema = z.object({
    body: z.object({
        city: z.string(),
        latitude: z.coerce.number().min(-90).max(90),
        longitude: z.coerce.number().min(-180).max(180),
        address: z.string().optional(),
    }),
});

export const getStationsWithParamsSchema = z.object({
    query: z.object({
        cityId: z.string().uuid().optional(),
        city: z.string().optional(),
        lat:z.string().optional(),
        lng:z.string().optional(),
        radius: z.string().optional(),
        limit: z.coerce.number().int().positive().max(200).optional(),
        skip: z.coerce.number().int().nonnegative().optional(),
    }).refine(
        (data) =>
            (!data.lat && !data.lng) ||
            (data.lat !== undefined && data.lng !== undefined),
        {
            message: "Both lat and lng must be provided together",
            path: ["lat"],
        }
    ),
});

export const getAdminStationsQuerySchema = z.object({
    query: z.object({
        cityId: z.string().uuid().optional(),
        city: z.string().trim().min(1).optional(),
        status: StationStatusEnum.optional(),
        limit: z.coerce.number().int().positive().max(200).optional(),
        skip: z.coerce.number().int().nonnegative().optional(),
    }),
});

export const oneStationSchema = z.object({
   params: z.object({
       id: z.string().uuid(),
   })
});

export const changeStatusStationSchema = z.object({
    body: z.object({
       status: StationStatusEnum,
    }),
    params: z.object({
        id: z.string().uuid(),
    })
});
