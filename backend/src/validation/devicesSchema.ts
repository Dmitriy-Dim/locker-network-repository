import {z} from "zod";
import {OperationType} from "../services/dto/operationDto";


export const replaceLockerSchema = z.object({
    body: z.object({
        bookingId: z.uuid("bookingId is wrong"),
        stationId: z.uuid("stationId is wrong"),
        lockerBoxId: z.uuid("lockerBoxId is wrong"),
        failedOperationId: z.uuid("failedOperationId is wrong").optional(),
        failedOperationType: z
            .union([
                z.literal(OperationType.LOCKER_OPEN),
                z.literal(OperationType.LOCKER_CLOSE),
            ])
            .optional(),
        reason: z.string().optional(),
        clientRequestId: z.string().optional(),
    }),
});

export const userDeviceOpenCloseSchema = z.object({
    body: z.object({
        bookingId: z.string().uuid(),
        lockerBoxId:  z.string().uuid(),
        stationId: z.string().uuid(),
        clientRequestId: z.string().optional(),
    }),
});

export const operDeviceOpenCloseSchema = z.object({
    body: z.discriminatedUnion("mode", [
        z.object({
            mode: z.literal("ALL"),
            stationId: z.string().uuid(),
            reason: z.string().min(1),
            clientRequestId: z.string().min(1).optional(),
        }),

        z.object({
            mode: z.literal("STATUS"),
            stationId: z.string().uuid(),
            status: z.enum([
                "AVAILABLE",
                "RESERVED",
                "OCCUPIED",
                "FAULTY",
                "EXPIRED",
            ]),
            reason: z.string().min(1),
            clientRequestId: z.string().min(1).optional(),
        }),

        z.object({
            mode: z.literal("IDS"),
            lockerBoxIds: z.array(z.string().uuid()).min(1),
            stationId: z.string().uuid(),
            reason: z.string().min(1),
            clientRequestId: z.string().min(1).optional(),
        }),
    ]),
});