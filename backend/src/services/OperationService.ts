import { Request, Response } from "express";
import { Role } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

import { HttpError } from "../errorHandler/HttpError";
import { operationRepository } from "../repositories/operation/OperationRepository";
import { logAudit } from "../utils/audit";
import { sendSuccess } from "../utils/response";

import {
    ActionType,
    Operation,
    OperationStatus,
    OperationType
} from "./dto/operationDto";
import { idempotencyService } from "./IdempotencyService";
import { sendOperationToQueue } from "./sqsService";

function asString(value: unknown) {
    return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown) {
    return typeof value === "number" ? value : undefined;
}

function buildOperationResponsePayload(operation: Operation & Record<string, unknown>) {
    const result = operation.result && typeof operation.result === "object"
        ? operation.result as Record<string, unknown>
        : {};

    const paymentProvider = asString(result.paymentProvider) ?? "stripe";
    const paymentSessionId = asString(result.paymentSessionId);
    const paymentIntentId = asString(result.paymentIntentId);
    const paymentUrl = asString(result.paymentUrl);

    return {
        operationId: operation.operationId,
        type: operation.type,
        status: operation.status,
        timestamp: operation.timestamp,
        ...(asString(operation.bookingId) ? { bookingId: asString(operation.bookingId) } : {}),
        ...(asString(operation.lockerBoxId) ? { lockerBoxId: asString(operation.lockerBoxId) } : {}),
        ...(asString(result.bookingStatus) ? { bookingStatus: asString(result.bookingStatus) } : {}),
        ...(asString(result.expiresAt) ? { expiresAt: asString(result.expiresAt) } : {}),
        ...(asNumber(result.price) !== undefined ? { price: asNumber(result.price) } : {}),
        ...(asString(result.currency) ? { currency: asString(result.currency) } : {}),
        ...((paymentSessionId || paymentIntentId || paymentUrl)
            ? {
                payment: {
                    provider: paymentProvider,
                    ...(paymentSessionId ? { paymentSessionId } : {}),
                    ...(paymentIntentId ? { paymentIntentId } : {}),
                    ...(paymentUrl ? { paymentUrl } : {}),
                },
            }
            : {}),
        ...(operation.errorMessage ? { errorMessage: operation.errorMessage } : {}),
        ...Object.fromEntries(
            Object.entries(result).filter(([key]) =>
                ![
                    "paymentProvider",
                    "paymentSessionId",
                    "paymentIntentId",
                    "paymentUrl",
                    "bookingStatus",
                    "expiresAt",
                    "price",
                    "currency",
                ].includes(key)
            )
        ),
    };
}

export class OperationCommandService {
    async createHealthCheckOperation(req: Request, res: Response) {
        return idempotencyService.execute(
            req,
            res,
            "operation:health-check",
            req.body,
            async () => {
                const operationId = uuidv4();
                const operation: Operation = {
                    operationId,
                    userId: req.user?.userId,
                    timestamp: new Date().toISOString(),
                    status: OperationStatus.PENDING,
                    type: OperationType.HEALTH_CHECK
                };

                try {
                    await operationRepository.create(operation);
                    await sendOperationToQueue({
                        operationId,
                        type: operation.type,
                        payload: {
                            timestamp: operation.timestamp,
                        }
                    });

                    await logAudit({
                        req,
                        action: ActionType.OPERATION_CREATE,
                        actorId: req.user?.userId,
                        entityId: operationId,
                        entityType: "Operation"
                    });

                    return {
                        body: {
                            operationId,
                            status: OperationStatus.PENDING,
                        }
                    };
                } catch (e) {
                    const errorMessage = e instanceof Error ? e.message : "Failed to create operation";

                    await operationRepository.updateStatus(operationId, OperationStatus.FAILED, errorMessage);
                    await logAudit({
                        req,
                        action: ActionType.OPERATION_CREATE_FAILED,
                        actorId: req.user?.userId,
                        entityId: operationId,
                        entityType: "Operation",
                        details: { reason: errorMessage }
                    });

                    throw new HttpError(500, errorMessage);
                }
            }
        );
    }

}

export class OperationReadService {
    async getOperationStatus(req: Request, res: Response) {
        let operation;

        try {
            operation = await operationRepository.findById(req.params.id as string);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "DynamoDB error";

            await logAudit({
                req,
                action: ActionType.OPERATION_INFO_FAILED,
                actorId: req.user?.userId,
                entityId: req.params.id as string,
                entityType: "Operation",
                details: { reason: errorMessage },
            });

            throw new HttpError(500, errorMessage);
        }

        if (!operation) {
            await logAudit({
                req,
                action: ActionType.OPERATION_INFO_FAILED,
                actorId: req.user?.userId,
                entityId: req.params.id as string,
                entityType: "Operation",
                details: { reason: "Not found" },
            });
            throw new HttpError(404, "Operation not found");
        }

        if (req.user?.role === Role.USER && (operation as Operation).userId && (operation as Operation).userId !== req.user.userId) {
            throw new HttpError(403, "Access denied");
        }

        await logAudit({
            req,
            action: ActionType.OPERATION_INFO,
            actorId: req.user?.userId,
            entityId: operation.operationId,
            entityType: "Operation"
        });

        // ToDo Delete mock after correct lambda
            const random = Math.floor(Math.random() * 10) + 1;
            if (operation.type === OperationType.LOCKER_OPEN || operation.type === OperationType.LOCKER_CLOSE) {
                if (random > 2){
                    operation.status = OperationStatus.SUCCESS;
                    operation.errorMessage = " ";
                }
                else {
                    operation.errorMessage = "mock error";
                }
            }

        //==========================

        return sendSuccess(res, buildOperationResponsePayload(operation as Operation & Record<string, unknown>));
    }
}

export const operationCommandService = new OperationCommandService();
export const operationReadService = new OperationReadService();
