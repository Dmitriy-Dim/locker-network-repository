import {Request, Response} from "express";
import {v4 as uuidv4} from "uuid";
import {LockerStatus, Role} from "@prisma/client";

import {logAudit} from "../utils/audit";
import {operationRepository} from "../repositories/operation/OperationRepository";
import {HttpError} from "../errorHandler/HttpError";
import {BookingRecordDto} from "../contracts/booking.dto";
import {lockerCatalogProjectionService} from "../repositories/prisma/LockerCatalogProjectionService";

import {prismaService} from "./prismaService";
import {idempotencyService} from "./IdempotencyService";
import {ActionType, OperationStatus, OperationType} from "./dto/operationDto";
import {
    sendCloseLockerOperatorCommand,
    sendCloseLockerUserCommand, sendOpenLockerOperatorCommand, sendOpenLockerUserCommand
} from "./sqsService";
import {getBooking} from "./dynamoService";
import {loadLockers, toLockerResponse} from "./lockerBox/lockerBoxService.helpers";




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

    //ToDo check active operations with this data and check lockerBoxIdStatus

}

async function findLockersByStation(stationId: string){
    const result = await prismaService.$transaction(async (tx) => {
        const station = await tx.lockerStation.findUnique({where: {stationId}});
        if (!station) throw new HttpError(404, "Station not found");

        return await lockerCatalogProjectionService.getLockerIdsByStationId(stationId,tx)
    });
    return result;

}

async function findLockersByStatus(stationId: string, status: LockerStatus){
    const lockers = await loadLockers();

    const result = lockers
        .filter((locker) => locker.stationId === stationId)
        .filter((locker) => locker.status === status)
        .map((locker) => locker.lockerBoxId);

    return result;

}

async function checkLockersIdsList(lockerBoxIds: string[], stationId:string){
    const result = await prismaService.$transaction(async (tx) => {
        const station = await tx.lockerStation.findUnique({where: {stationId}});
        if (!station) throw new HttpError(404, "Station not found");

        return await lockerCatalogProjectionService.getLockerIdsByStationId(stationId,tx)
    });
    const targetLockersIds = lockerBoxIds.filter(lockerBoxId => result.includes(lockerBoxId));
    return targetLockersIds;

}


async function findLockers(data: {
    stationId: string;
    mode: string;
    status?: string;
    lockerBoxIds?: string[];
}){
    switch (data.mode){
        case "ALL": return await findLockersByStation(data.stationId)
        case "STATUS": return await findLockersByStatus(data.stationId, data.status! as LockerStatus);
        case "IDS": return await checkLockersIdsList(data.lockerBoxIds!, data.stationId);
        default: return [];
    }
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
        return idempotencyService.execute(
            req,
            res,
            "locker-open:operator",
            req.body,
            async () => {
                const userId = req.user?.userId;

                if (!userId) {
                    throw new HttpError(401, "Unauthorized");
                }

                const {mode, stationId, lockerBoxIds, status, clientRequestId, reason} = req.body as {mode: string, stationId: string, lockerBoxIds: string[] | undefined, status: string | undefined, clientRequestId:string, reason:string};
                const lockers = await findLockers({stationId, mode, status ,lockerBoxIds});
                if (lockers.length === 0) {
                    throw new HttpError(409, "No lockers match operator open filter");
                }

                const operationId = uuidv4();

                try {
                    await operationRepository.create({
                        operationId,
                        userId,
                        timestamp: new Date().toISOString(),
                        status: OperationStatus.PENDING,
                        type: OperationType.LOCKER_OPEN_BATCH,
                    });

                    await sendOpenLockerOperatorCommand({
                        operationId,
                        type: OperationType.LOCKER_OPEN_BATCH,
                        payload: {
                            actorId: userId,
                            actorRole: req.user?.role as string,
                            stationId,
                            mode,
                            status,
                            lockerBoxIds: lockers,
                            reason,
                            clientRequestId,
                            requestedAt: new Date().toISOString(),
                        },
                    });

                    await logAudit({
                        req,
                        action: ActionType.LOCKER_OPEN_OPERATOR,
                        actorId: userId,
                        entityId: operationId,
                        entityType: "Operation",
                        details: {
                            sourceOfTruth: "lambda-dynamodb",
                            stationId: stationId,
                            reason: reason,
                            mode: mode,
                        },
                    });

                    return {
                        statusCode: 202,
                        body: toQueuedDeviceOperationResponse(
                            operationId,
                            OperationType.LOCKER_OPEN_BATCH,
                            undefined,
                            "Batch locker open operation created"
                        ),
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Failed to create device operation";

                    await operationRepository.updateStatus(operationId, OperationStatus.FAILED, errorMessage);
                    await logAudit({
                        req,
                        action: ActionType.LOCKER_OPEN_OPERATOR_FAILED,
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


    async closeDeviceOper(req: Request, res: Response) {
        return idempotencyService.execute(
            req,
            res,
            "locker-close:operator",
            req.body,
            async () => {
                const userId = req.user?.userId;

                if (!userId) {
                    throw new HttpError(401, "Unauthorized");
                }

                const {mode, stationId, lockerBoxIds, status, clientRequestId, reason} = req.body as {mode: string, stationId: string, lockerBoxIds: string[] | undefined, status: string | undefined, clientRequestId:string, reason:string};

                const lockers = await findLockers({stationId, mode, status ,lockerBoxIds});

                if (!lockers) {
                    throw new HttpError(409, "No lockers match operator close filter");
                }

                const operationId = uuidv4();

                try {
                    await operationRepository.create({
                        operationId,
                        userId,
                        timestamp: new Date().toISOString(),
                        status: OperationStatus.PENDING,
                        type: OperationType.LOCKER_CLOSE_BATCH,
                    });

                    await sendCloseLockerOperatorCommand({
                        operationId,
                        type: OperationType.LOCKER_CLOSE_BATCH,
                        payload: {
                            actorId: userId,
                            actorRole: req.user?.role as string,
                            stationId,
                            mode,
                            status,
                            lockerBoxIds: lockers,
                            reason,
                            clientRequestId,
                            requestedAt: new Date().toISOString(),
                        },
                    });

                    await logAudit({
                        req,
                        action: ActionType.LOCKER_CLOSE_OPERATOR,
                        actorId: userId,
                        entityId: operationId,
                        entityType: "Operation",
                        details: {
                            sourceOfTruth: "lambda-dynamodb",
                            stationId: stationId,
                            reason: reason,
                            mode: mode,
                        },
                    });

                    return {
                        statusCode: 202,
                        body: toQueuedDeviceOperationResponse(
                            operationId,
                            OperationType.LOCKER_CLOSE_BATCH,
                            undefined,
                            "Batch locker close operation created"
                        ),
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Failed to create device operation";

                    await operationRepository.updateStatus(operationId, OperationStatus.FAILED, errorMessage);
                    await logAudit({
                        req,
                        action: ActionType.LOCKER_CLOSE_OPERATOR_FAILED,
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


}

export const deviceService = new DeviceService();