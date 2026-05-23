import { randomUUID } from "crypto";

import { SendMessageCommand } from "@aws-sdk/client-sqs";

import { LockerCacheDto } from "../contracts/cache.dto";
import { HttpError } from "../errorHandler/HttpError";
import { sqsClient } from "../utils/sqsClient";
import {env} from "../config/env";
import {emitSecurityAlert} from "../utils/securityAlert";

import {OperationType} from "./dto/operationDto";

const QUEUE_URL = env.OPERATIONS_QUEUE_URL || env.SQS_URL;
const CACHE_PROJECTION_QUEUE_URL = env.CACHE_PROJECTION_QUEUE_URL;

export type QueueCommand = {
    operationId: string;
    type: OperationType;
    payload?: Record<string, unknown>;
};

export type PaymentConfirmCommand = {
    operationId: string;
    type: OperationType.PAYMENT_CONFIRM;
    payload: {
        bookingId: string;
        paymentSessionId: string;
        providerPaymentId: string;
        amount: number;
        currency: string;
    };
};

export type BookingExtendCommand = {
    operationId: string;
    type: OperationType.BOOKING_EXTEND;
    payload: {
        bookingId: string;
        userId: string;
        expectedEndTime: string;
    };
};

export type BookingCancelCommand = {
    operationId: string;
    type: OperationType.BOOKING_CANCEL;
    payload: {
        bookingId: string;
        actorId: string;
    };
};

export type BookingStatusUpdateCommand = {
    operationId: string;
    type: OperationType.BOOKING_UPDATE_STATUS;
    payload: {
        bookingId: string;
        actorId: string;
        status: string;
    };
};

export type BookingInitCommand = {
    operationId: string;
    type: OperationType.BOOKING_INIT;
    payload: {
        userId: string;
        stationId: string;
        size: "S" | "M" | "L";
        expectedEndTime: string;
    };
};

export type BookingExtendConfirmCommand = {
    operationId: string;
    type: OperationType.BOOKING_EXTEND_CONFIRM;
    payload: {
        bookingId: string;
        userId: string;
        expectedEndTime: string;
        paymentSessionId: string;
        providerPaymentId: string;
        amount: number;
        currency: string;
    };
};

export type OpenLockerUserCommand = {
    operationId: string;
    type: OperationType.LOCKER_OPEN;
    payload: {
        userId: string;
        stationId: string;
        lockerBoxId: string;
        bookingId: string;
        clientRequestId: string;
        requestedAt: string;
    };
};

export type CloseLockerUserCommand = {
    operationId: string;
    type: OperationType.LOCKER_CLOSE;
    payload: {
        userId: string;
        stationId: string;
        lockerBoxId: string;
        bookingId: string;
        clientRequestId: string;
        requestedAt: string;
        finalizeBooking?: boolean;
    };
};

export type BookingEndCommand = {
    operationId: string;
    type: OperationType.BOOKING_END;
    payload: {
        userId: string;
        stationId: string;
        lockerBoxId: string;
        bookingId: string;
        clientRequestId: string;
        requestedAt: string;
    };
};

export type OpenLockerOperatorCommand = {
    operationId: string;
    type: OperationType.LOCKER_OPEN_BATCH;
    payload: {
        actorId: string;
        actorRole: string;
        stationId: string;
        mode: string;
        status: string | undefined;
        lockerBoxIds: string[];
        reason: string;
        clientRequestId: string;
        requestedAt: string;
    };
};

export type CloseLockerOperatorCommand = {
    operationId: string;
    type: OperationType.LOCKER_CLOSE_BATCH;
    payload: {
        actorId: string;
        actorRole: string;
        stationId: string;
        mode: string;
        status: string | undefined;
        lockerBoxIds: string[];
        reason: string;
        clientRequestId: string;
        requestedAt: string;
    };
};

type LockerCacheProjectionEvent =
    | {
        eventId: string;
        schemaVersion: number;
        correlationId: string;
        occurredAt: string;
        actorId: string | null;
        entityId: string;
        projectionVersion: number;
        entityType: "locker_cache";
        eventType: "UPSERT";
        payload: LockerCacheDto;
    }
    | {
        eventId: string;
        schemaVersion: number;
        correlationId: string;
        occurredAt: string;
        actorId: string | null;
        entityId: string;
        projectionVersion: number;
        entityType: "locker_cache";
        eventType: "DELETE";
        payload: {
            lockerBoxId: string;
        };
    };

async function sendCommandToQueue(command: QueueCommand) {
    try {
        await sqsClient.send(
            new SendMessageCommand({
                QueueUrl: QUEUE_URL,
                MessageBody: JSON.stringify(command),

                MessageAttributes: {
                    type: {
                        DataType: "String",
                        StringValue: command.type,
                    },
                },
            })
        );
    } catch (error) {
        emitSecurityAlert({
            eventType: "SQS_SEND_FAILED",
            severity: "HIGH",
            reason: "Backend failed to enqueue SQS command",
            details: {
                commandType: command.type,
                operationId: command.operationId,
                error: error instanceof Error ? error.message : "Unknown error",
            },
        });
        throw error;
    }
}

function getCacheProjectionQueueUrl() {
    if (!CACHE_PROJECTION_QUEUE_URL) {
        throw new HttpError(500, "CACHE_PROJECTION_QUEUE_URL is not configured");
    }

    return CACHE_PROJECTION_QUEUE_URL;
}

async function sendCacheProjectionEvent(event: LockerCacheProjectionEvent) {
    try {
        await sqsClient.send(
            new SendMessageCommand({
                QueueUrl: getCacheProjectionQueueUrl(),
                MessageBody: JSON.stringify(event),
                MessageAttributes: {
                    entityType: {
                        DataType: "String",
                        StringValue: event.entityType,
                    },
                    eventType: {
                        DataType: "String",
                        StringValue: event.eventType,
                    },
                },
            })
        );
    } catch (error) {
        emitSecurityAlert({
            eventType: "SQS_SEND_FAILED",
            severity: "HIGH",
            reason: "Backend failed to enqueue cache projection event",
            correlationId: event.correlationId,
            actorId: event.actorId,
            details: {
                entityType: event.entityType,
                eventType: event.eventType,
                entityId: event.entityId,
                projectionVersion: event.projectionVersion,
                error: error instanceof Error ? error.message : "Unknown error",
            },
        });
        throw error;
    }
}

function buildCacheProjectionEnvelope(
    entityId: string,
    projectionVersion: number,
    correlationId?: string,
    actorId?: string | null
) {
    return {
        eventId: randomUUID(),
        schemaVersion: 1,
        correlationId: correlationId ?? randomUUID(),
        occurredAt: new Date().toISOString(),
        actorId: actorId ?? null,
        entityId,
        projectionVersion,
    };
}

export async function sendOperationToQueue(operation: QueueCommand) {
    await sendCommandToQueue(operation);
}

export async function sendPaymentConfirmToQueue(command: PaymentConfirmCommand) {
    await sendCommandToQueue(command);
}

export async function sendBookingExtendToQueue(command: BookingExtendCommand) {
    await sendCommandToQueue(command);
}

export async function sendBookingCancelToQueue(command: BookingCancelCommand) {
    await sendCommandToQueue(command);
}

export async function sendBookingEndToQueue(command: BookingEndCommand) {
    await sendCommandToQueue(command);
}

export async function sendBookingStatusUpdateToQueue(command: BookingStatusUpdateCommand) {
    await sendCommandToQueue(command);
}

export async function sendBookingInitToQueue(command: BookingInitCommand) {
    await sendCommandToQueue(command);
}

export async function sendBookingExtendConfirmToQueue(command: BookingExtendConfirmCommand) {
    await sendCommandToQueue(command);
}

export async function sendOpenLockerUserCommand(command: OpenLockerUserCommand) {
    await sendCommandToQueue(command);
}

export async function sendCloseLockerUserCommand(command: CloseLockerUserCommand) {
    await sendCommandToQueue(command);
}

export async function sendOpenLockerOperatorCommand(command: OpenLockerOperatorCommand) {
    await sendCommandToQueue(command);
}

export async function sendCloseLockerOperatorCommand(command: CloseLockerOperatorCommand) {
    await sendCommandToQueue(command);
}

export async function enqueueLockerProjectionUpsert(
    projection: LockerCacheDto,
    correlationId?: string,
    actorId?: string | null,
    projectionVersion = projection.version
) {
    await sendCacheProjectionEvent({
        ...buildCacheProjectionEnvelope(projection.lockerBoxId, projectionVersion, correlationId, actorId),
        entityType: "locker_cache",
        eventType: "UPSERT",
        payload: {
            ...projection,
            version: projectionVersion,
        },
    });
}

export async function enqueueLockerProjectionDelete(
    lockerBoxId: string,
    version = 0,
    correlationId?: string,
    actorId?: string | null
) {
    await sendCacheProjectionEvent({
        ...buildCacheProjectionEnvelope(lockerBoxId, version, correlationId, actorId),
        entityType: "locker_cache",
        eventType: "DELETE",
        payload: {
            lockerBoxId,
        },
    });
}

export type ReplaceLockerCommand = {
    operationId: string;
    type: OperationType.LOCKER_REPLACE;
    payload: {
        userId: string;
        bookingId: string;
        stationId: string;
        lockerBoxId: string;

        failedOperationId?: string;
        failedOperationType?: OperationType.LOCKER_OPEN | OperationType.LOCKER_CLOSE;
        reason?: string;

        clientRequestId?: string;
        requestedAt: string;
    };
};
