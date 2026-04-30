import {z} from "zod";

export const userDeviceOpenCloseSchema = z.object({
    body: z.object({
        bookingId: z.string().uuid(),
        lockerBoxId:  z.string().uuid(),
        stationId: z.string().uuid(),
        clientRequestId: z.string().optional(),
    }),
});