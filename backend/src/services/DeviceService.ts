import {Request, Response} from "express";
import {v4 as uuidv4} from "uuid";
import {Role} from "@prisma/client";

import {logAudit} from "../utils/audit";
import {operationRepository} from "../repositories/operation/OperationRepository";
import {HttpError} from "../errorHandler/HttpError";
import {BookingRecordDto} from "../contracts/booking.dto";

import {idempotencyService} from "./IdempotencyService";
import {ActionType, OperationStatus, OperationType} from "./dto/operationDto";
import {sendCloseLockerUserCommand, sendOpenLockerUserCommand} from "./sqsService";
import {getBooking} from "./dynamoService";
import {prismaService} from "./prismaService";


function toQueuedDeviceOperationResponse<T extends Record<string, unknown>>(
    operationId: string,
    type: OperationType,
    payload?: T,
    message?: string
) {
    return {
        operationId,
        status: OperationStatus.PENDING,
        type,
        ...(payload ?? {}),
        ...(message ? { message } : {}),
    };
}

async function checkDataUserRequest(req: Request, userId: string){
    const {stationId, lockerBoxId, bookingId} = req.body as {stationId: string, lockerBoxId: string, bookingId: string};
    const role = req.user?.role;

    const locker = await prismaService.lockerBox.findUnique({
        where: {lockerBoxId}
    })
    if (!locker) {
        throw new HttpError(404, "locker not found");
    }
    if (locker.techStatus !== 'ACTIVE'){
        throw new HttpError(409, "locker not ACTIVE");
    }

    const booking = await getBooking(bookingId) as BookingRecordDto | undefined;
    if (!booking) {
        throw new HttpError(404, "Booking not found");
    }
    if (role === Role.USER && booking.userId !== userId){
        throw new HttpError(403, "Access denied");
    }
    if (booking.status !== "ACTIVE") {
        throw new HttpError(409, "Booking is not active");
    }
    if (new Date(booking.expectedEndTime) < new Date()){
        throw new HttpError(409, "Booking has expired");
    }
    if(booking.lockerBoxId !== lockerBoxId){
        throw new HttpError(409, "Locker does not match booking");
    }
    if (booking.stationId !== stationId) {
        throw new HttpError(409, "Station does not match booking");
    }

    //ToDo check active operations with this data

}


export class DeviceService {

    async openDeviceUser(req: Request, res: Response) {
        return idempotencyService.execute(
            req,
            res,
            "locker-open:user",
            req.body,
            async () => {
                const userId = req.user?.userId;

                if (!userId) {
                    throw new HttpError(401, "Unauthorized");
                }

                await checkDataUserRequest(req, userId);

                const operationId = uuidv4();
                const {stationId, lockerBoxId, bookingId, clientRequestId} = req.body as {stationId: string, lockerBoxId: string, bookingId: string, clientRequestId: string};

                try {
                    await operationRepository.create({
                        operationId,
                        userId,
                        timestamp: new Date().toISOString(),
                        status: OperationStatus.PENDING,
                        type: OperationType.LOCKER_OPEN,
                    });

                    await sendOpenLockerUserCommand({
                        operationId,
                        type: OperationType.LOCKER_OPEN,
                        payload: {
                            userId,
                            stationId,
                            lockerBoxId,
                            bookingId,
                            clientRequestId,
                            requestedAt: new Date().toISOString(),
                        },
                    });

                    await logAudit({
                        req,
                        action: ActionType.LOCKER_OPEN_USER,
                        actorId: userId,
                        entityId: operationId,
                        entityType: "Operation",
                        details: {
                            sourceOfTruth: "lambda-dynamodb",
                            stationId: stationId,
                            lockerBoxId: lockerBoxId,
                            bookingId: bookingId,
                        },
                    });

                    return {
                        statusCode: 202,
                        body: toQueuedDeviceOperationResponse(
                            operationId,
                            OperationType.LOCKER_OPEN,
                            undefined,
                            "Locker open command accepted"
                        ),
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Failed to create device operation";

                    await operationRepository.updateStatus(operationId, OperationStatus.FAILED, errorMessage);
                    await logAudit({
                        req,
                        action: ActionType.LOCKER_OPEN_USER_FAILED,
                        actorId: userId,
                        entityId: operationId,
                        entityType: "Operation",
                        details: {
                            reason: errorMessage,
                        },
                    });

                    throw new HttpError(500, errorMessage);
                }
            }
        );
    }

    async closeDeviceUser(req: Request, res: Response) {
        return idempotencyService.execute(
            req,
            res,
            "locker-close:user",
            req.body,
            async () => {
                const userId = req.user?.userId;

                if (!userId) {
                    throw new HttpError(401, "Unauthorized");
                }

                await checkDataUserRequest(req, userId);

                const operationId = uuidv4();
                const {stationId, lockerBoxId, bookingId, clientRequestId} = req.body as {stationId: string, lockerBoxId: string, bookingId: string, clientRequestId:string};

                try {
                    await operationRepository.create({
                        operationId,
                        userId,
                        timestamp: new Date().toISOString(),
                        status: OperationStatus.PENDING,
                        type: OperationType.LOCKER_CLOSE,
                    });

                    await sendCloseLockerUserCommand({
                        operationId,
                        type: OperationType.LOCKER_CLOSE,
                        payload: {
                            userId,
                            stationId,
                            lockerBoxId,
                            bookingId,
                            clientRequestId,
                            requestedAt: new Date().toISOString(),
                        },
                    });

                    await logAudit({
                        req,
                        action: ActionType.LOCKER_CLOSE_USER,
                        actorId: userId,
                        entityId: operationId,
                        entityType: "Operation",
                        details: {
                            sourceOfTruth: "lambda-dynamodb",
                            stationId: stationId,
                            lockerBoxId: lockerBoxId,
                            bookingId: bookingId,
                        },
                    });

                    return {
                        statusCode: 202,
                        body: toQueuedDeviceOperationResponse(
                            operationId,
                            OperationType.LOCKER_CLOSE,
                            undefined,
                            "Locker close operation created"
                        ),
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Failed to create device operation";

                    await operationRepository.updateStatus(operationId, OperationStatus.FAILED, errorMessage);
                    await logAudit({
                        req,
                        action: ActionType.LOCKER_CLOSE_USER_FAILED,
                        actorId: userId,
                        entityId: operationId,
                        entityType: "Operation",
                        details: {
                            reason: errorMessage,
                        },
                    });

                    throw new HttpError(500, errorMessage);
                }
            }
        );
    }

    async openDeviceOper(req: Request, res: Response) {


        return res.status(200).send({message: "Not implemented yet"});
    }


    async closeDeviceOper(req: Request, res: Response) {


        return res.status(200).send({message: "Not implemented yet"});
    }


}

export const deviceService = new DeviceService();