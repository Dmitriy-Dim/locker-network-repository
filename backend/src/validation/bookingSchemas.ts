import { z } from "zod";
import { BookingStatus } from "@prisma/client";

import { LockerSizeEnum } from "./lockersSchema";

const MIN_BOOKING_DURATION_MS = 5 * 60 * 1000;
const futureMinBookingEndTime = z.string().datetime().refine((value) => {
    const endTime = new Date(value);

    return !Number.isNaN(endTime.getTime())
        && endTime.getTime() >= Date.now() + MIN_BOOKING_DURATION_MS;
}, {
    message: "expectedEndTime must be at least 5 minutes in the future",
});

export const bookingInitSchema = z.object({
    body: z.object({
        stationId: z.string().uuid(),
        size: LockerSizeEnum,
        expectedEndTime: futureMinBookingEndTime,
    }),
});

export const oneBookingSchema = z.object({
    params: z.object({
        id: z.string().uuid(),
    }),
});

const extendBookingPayloadSchema = z.object({
    expectedEndTime: z.string().datetime(),
});

export const extendBookingSchema = z.object({
    params: z.object({
        id: z.string().uuid(),
    }),
    body: extendBookingPayloadSchema,
});

export const BookingStatusEnum = z.nativeEnum(BookingStatus);

export const bookingStatusChangeSchema = z.object({
    params: z.object({
        id: z.string().uuid(),
    }),
    body: z.object({
        status: BookingStatusEnum,
    }),
});

export const adminBookingsQuerySchema = z.object({
    query: z.object({
        status: BookingStatusEnum.optional(),
        userId: z.string().uuid().optional(),
        lockerBoxId: z.string().uuid().optional(),
        stationId: z.string().uuid().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.coerce.number().int().positive().max(200).optional(),
        skip: z.coerce.number().int().nonnegative().optional(),
    }),
});

export const myBookingsQuerySchema = z.object({
    query: z.object({
        status: BookingStatusEnum.optional(),
        lockerBoxId: z.string().uuid().optional(),
        stationId: z.string().uuid().optional(),
        limit: z.coerce.number().int().positive().max(100).optional(),
        skip: z.coerce.number().int().nonnegative().optional(),
    }),
});
