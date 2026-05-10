import { Request, Response } from "express";
import { BookingStatus, Prisma, Role } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

import { BookingInitRequestDto, BookingRecordDto } from "../contracts/booking.dto";
import { HttpError } from "../errorHandler/HttpError";
import { operationRepository } from "../repositories/operation/OperationRepository";
import { logAudit } from "../utils/audit";
import { sendSuccess } from "../utils/response";

import {ActionType, OperationStatus, OperationType} from "./dto/operationDto";
import {
    sendBookingCancelToQueue,
    sendBookingExtendToQueue,
    sendBookingInitToQueue,
    sendBookingStatusUpdateToQueue,
    sendCloseLockerUserCommand
} from "./sqsService";
import { getAllBookings, getBooking, getLockerCache } from "./dynamoService";
import {idempotencyService} from "./IdempotencyService";
import { prismaService } from "./prismaService";

function toPublicBookingResponse(input: {
    bookingId: string;
    paymentStatus: string;
    bookingStatus: string;
    lockerStatus?: string | null;
    lockerBoxId: string;
    stationId: string;
    startTime: Date | string | null;
    expectedEndTime: Date | string | null;
}) {
    return {
        bookingId: input.bookingId,
        paymentStatus: input.paymentStatus,
        bookingStatus: input.bookingStatus,
        ...(input.lockerStatus ? { lockerStatus: input.lockerStatus } : {}),
        lockerBoxId: input.lockerBoxId,
        stationId: input.stationId,
        startTime: input.startTime instanceof Date
            ? input.startTime.toISOString()
            : input.startTime ?? null,
        expectedEndTime: input.expectedEndTime instanceof Date
            ? input.expectedEndTime.toISOString()
            : input.expectedEndTime ?? null,
    };
}

function toQueuedBookingOperationResponse<T extends Record<string, unknown>>(
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

function resolveRequestedExpectedEndTime(req: Request) {
    const rawValue = typeof req.body?.expectedEndTime === "string"
        ? req.body.expectedEndTime
        : undefined;

    if (!rawValue) {
        throw new HttpError(400, "expectedEndTime is required", "VALIDATION_ERROR");
    }

    const nextExpectedEndTime = new Date(rawValue);

    if (Number.isNaN(nextExpectedEndTime.getTime())) {
        throw new HttpError(400, "expectedEndTime must be a valid ISO datetime", "VALIDATION_ERROR");
    }

    return nextExpectedEndTime;
}

async function loadBookingWithLockerStatus(bookingId: string) {
    const booking = await getBooking(bookingId) as BookingRecordDto | undefined;

    if (!booking) {
        return undefined;
    }

    const locker = await getLockerCache(booking.lockerBoxId);
    const lockerStatus = booking.lockerStatus ?? locker?.status ?? null;

    return {
        booking,
        lockerStatus,
    };
}

const CANCELLABLE_BOOKING_STATUSES = new Set<string>([
    BookingStatus.PENDING,
    BookingStatus.ACTIVE,
    BookingStatus.EXPIRED,
]);

function isCancellableBookingStatus(status: string) {
    return CANCELLABLE_BOOKING_STATUSES.has(status);
}

export class BookingService {
    async initBooking(req: Request, res: Response) {
        return idempotencyService.execute(
            req,
            res,
            "booking-init",
            req.body,
            async () => {
                const userId = req.user?.userId;

                if (!userId) {
                    throw new HttpError(401, "Unauthorized");
                }

                const operationId = uuidv4();
                const body = req.body as BookingInitRequestDto;

                try {
                    await operationRepository.create({
                        operationId,
                        userId,
                        timestamp: new Date().toISOString(),
                        status: OperationStatus.PENDING,
                        type: OperationType.BOOKING_INIT,
                    });

                    await sendBookingInitToQueue({
                        operationId,
                        type: OperationType.BOOKING_INIT,
                        payload: {
                            userId,
                            stationId: body.stationId,
                            size: body.size,
                            expectedEndTime: body.expectedEndTime,
                        },
                    });

                    await logAudit({
                        req,
                        action: ActionType.BOOKING_INIT,
                        actorId: userId,
                        entityId: operationId,
                        entityType: "Operation",
                        details: {
                            sourceOfTruth: "lambda-dynamodb",
                            stationId: body.stationId,
                            size: body.size,
                            expectedEndTime: body.expectedEndTime,
                        },
                    });

                    return {
                        statusCode: 202,
                        body: toQueuedBookingOperationResponse(
                            operationId,
                            OperationType.BOOKING_INIT,
                            undefined,
                            "Booking initialization started"
                        ),
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Failed to create booking operation";

                    await operationRepository.updateStatus(operationId, OperationStatus.FAILED, errorMessage);
                    await logAudit({
                        req,
                        action: ActionType.BOOKING_INIT_FAILED,
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

    async getBooking(req: Request, res: Response) {
        const bookingWithLocker = await loadBookingWithLockerStatus(req.params.id as string);

        if (!bookingWithLocker) {
            throw new HttpError(404, "Booking not found");
        }

        const { booking, lockerStatus } = bookingWithLocker;
        const role = req.user?.role;
        const userId = req.user?.userId;

        if (role === Role.USER && booking.userId !== userId) {
            throw new HttpError(403, "Access denied");
        }

        await logAudit({
            req,
            action: ActionType.BOOKING_INFO,
            actorId: userId,
            entityId: booking.bookingId,
            entityType: "Booking",
            lockerId: booking.lockerBoxId,
            details: {
                sourceOfTruth: "dynamodb",
            },
        });

        return sendSuccess(res, toPublicBookingResponse({
            bookingId: booking.bookingId,
            paymentStatus: booking.paymentStatus ?? "PENDING",
            bookingStatus: booking.status,
            lockerStatus,
            lockerBoxId: booking.lockerBoxId,
            stationId: booking.stationId,
            startTime: booking.startTime ?? null,
            expectedEndTime: booking.expectedEndTime,
        }));
    }

    async getAllBookingsAdmin(req: Request, res: Response) {
        const limit = req.query.limit === undefined ? undefined : Number(req.query.limit);
        const skip = Number(req.query.skip ?? 0);
        const status = req.query.status as BookingStatus | undefined;
        const userId = req.query.userId as string | undefined;
        const lockerBoxId = req.query.lockerBoxId as string | undefined;
        const stationId = req.query.stationId as string | undefined;
        const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
        const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
        const where: Prisma.BookingWhereInput = {
            ...(status && { status }),
            ...(userId && { userId }),
            ...(lockerBoxId && { lockerBoxId }),
            ...(stationId && { stationId }),
            ...((from || to) && {
                createdAt: {
                    ...(from && { gte: from }),
                    ...(to && { lte: to }),
                },
            }),
        };

        const [result, total] = await prismaService.$transaction([
            prismaService.booking.findMany({
                where,
                include: {
                    payments: true,
                },
                orderBy: {
                    createdAt: "desc",
                },
                skip,
                ...(limit !== undefined && { take: limit }),
            }),
            prismaService.booking.count({ where }),
        ]);

        await logAudit({
            req,
            action: ActionType.BOOKING_INFO,
            actorId: req.user?.userId,
            entityId: "admin-bookings-list",
            entityType: "Booking",
            details: {
                sourceOfTruth: "postgres",
                count: result.length,
                scope: "admin",
                filters: {
                    status,
                    userId,
                    lockerBoxId,
                    stationId,
                    from: from?.toISOString(),
                    to: to?.toISOString(),
                    limit,
                    skip,
                },
            },
        });

        return sendSuccess(res, result, 200, {
            limit,
            skip,
            total,
        });
    }

    async getBookingAdmin(req: Request, res: Response) {
        const bookingId = req.params.id as string;
        const result = await prismaService.booking.findUnique({
            where: { bookingId },
            include: {
                payments: true,
            },
        });

        if (!result) {
            throw new HttpError(404, "Booking not found");
        }

        await logAudit({
            req,
            action: ActionType.BOOKING_INFO,
            actorId: req.user?.userId,
            entityId: bookingId,
            entityType: "Booking",
            lockerId: result.lockerBoxId,
            details: {
                sourceOfTruth: "postgres",
                scope: "admin",
            },
        });

        return sendSuccess(res, result);
    }

    async updateBookingStatusAdmin(req: Request, res: Response) {
        const bookingId = req.params.id as string;
        const nextStatus = req.body.status as BookingStatus;
        const actorId = req.user?.userId;

        const existing = await prismaService.booking.findUnique({
            where: { bookingId },
        });

        if (!existing) {
            throw new HttpError(404, "Booking not found");
        }

        if (!actorId) {
            throw new HttpError(401, "Unauthorized");
        }

        return idempotencyService.execute(
            req,
            res,
            `booking-status-update:${bookingId}`,
            {
                bookingId,
                status: nextStatus,
            },
            async () => {
                const operationId = uuidv4();

                try {
                    const updated = await prismaService.booking.update({
                        where: { bookingId },
                        data: {
                            status: nextStatus,
                            ...(nextStatus === BookingStatus.CANCELLED || nextStatus === BookingStatus.ENDED
                                ? { endTime: new Date() }
                                : {}),
                        },
                    });

                    await operationRepository.create({
                        operationId,
                        userId: actorId,
                        timestamp: new Date().toISOString(),
                        status: OperationStatus.PENDING,
                        type: OperationType.BOOKING_UPDATE_STATUS,
                    });

                    await sendBookingStatusUpdateToQueue({
                        operationId,
                        type: OperationType.BOOKING_UPDATE_STATUS,
                        payload: {
                            bookingId,
                            actorId,
                            status: nextStatus,
                        },
                    });

                    await logAudit({
                        req,
                        action: ActionType.OPERATION_CREATE,
                        actorId,
                        entityId: operationId,
                        entityType: "Operation",
                        lockerId: existing.lockerBoxId,
                        details: {
                            operationType: OperationType.BOOKING_UPDATE_STATUS,
                            bookingId,
                            previousStatus: existing.status,
                            nextStatus,
                            scope: "admin",
                            sourceOfTruth: "postgres-localstack-sync",
                        },
                    });

                    return {
                        statusCode: 202,
                        body: toQueuedBookingOperationResponse(
                            operationId,
                            OperationType.BOOKING_UPDATE_STATUS,
                            {
                                bookingId,
                                requestedStatus: nextStatus,
                                persistedStatus: updated.status,
                            },
                            "Booking status update queued"
                        ),
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Failed to queue booking status update";

                    await operationRepository.updateStatus(operationId, OperationStatus.FAILED, errorMessage);
                    await logAudit({
                        req,
                        action: ActionType.BOOKING_UPDATE_STATUS_FAILED,
                        actorId,
                        entityId: bookingId,
                        entityType: "Booking",
                        lockerId: existing.lockerBoxId,
                        details: {
                            previousStatus: existing.status,
                            nextStatus,
                            reason: errorMessage,
                            sourceOfTruth: "postgres",
                        },
                    });

                    throw new HttpError(500, errorMessage);
                }
            }
        );
    }

    async cancelBooking(req: Request, res: Response) {
        const bookingId = req.params.id as string;
        const bookingWithLocker = await loadBookingWithLockerStatus(bookingId);

        if (!bookingWithLocker) {
            throw new HttpError(404, "Booking not found");
        }

        const { booking, lockerStatus } = bookingWithLocker;
        const userId = req.user?.userId;
        const role = req.user?.role;

        if (role === Role.USER && booking.userId !== userId) {
            throw new HttpError(403, "Access denied");
        }

        if (booking.status === "CANCELLED") {
            return sendSuccess(res, {
                bookingId: booking.bookingId,
                bookingStatus: booking.status,
                lockerStatus,
                message: "Booking already cancelled",
            });
        }

        if (!isCancellableBookingStatus(booking.status)) {
            throw new HttpError(409, `Cannot cancel booking with status ${booking.status}`);
        }

        if (!userId) {
            throw new HttpError(401, "Unauthorized");
        }

        return idempotencyService.execute<Record<string, unknown>>(
            req,
            res,
            `booking-cancel:${bookingId}`,
            { bookingId },
            async () => {
                const operationId = uuidv4();
                let operationCreated = false;

                try {
                    const existingRdsBooking = await prismaService.booking.findUnique({
                        where: { bookingId },
                    });

                    if (existingRdsBooking?.status === BookingStatus.CANCELLED) {
                        return {
                            statusCode: 200,
                            body: {
                                bookingId,
                                bookingStatus: existingRdsBooking.status,
                                lockerStatus,
                                message: "Booking already cancelled",
                            },
                        };
                    }

                    if (existingRdsBooking && !isCancellableBookingStatus(existingRdsBooking.status)) {
                        throw new HttpError(409, `Cannot cancel booking with status ${existingRdsBooking.status}`);
                    }

                    if (!existingRdsBooking && booking.status !== BookingStatus.PENDING) {
                        throw new HttpError(409, "Booking is not finalized in RDS yet");
                    }

                    await operationRepository.create({
                        operationId,
                        userId,
                        timestamp: new Date().toISOString(),
                        status: OperationStatus.PENDING,
                        type: OperationType.BOOKING_CANCEL,
                    });
                    operationCreated = true;

                    const updated = existingRdsBooking
                        ? await prismaService.booking.update({
                            where: { bookingId },
                            data: {
                                status: BookingStatus.CANCELLED,
                                endTime: new Date(),
                            },
                        })
                        : undefined;

                    await sendBookingCancelToQueue({
                        operationId,
                        type: OperationType.BOOKING_CANCEL,
                        payload: {
                            bookingId,
                            actorId: userId,
                        },
                    });

                    await logAudit({
                        req,
                        action: ActionType.OPERATION_CREATE,
                        actorId: userId,
                        entityId: operationId,
                        entityType: "Operation",
                        lockerId: booking.lockerBoxId,
                        details: {
                            operationType: OperationType.BOOKING_CANCEL,
                            bookingId,
                            previousStatus: booking.status,
                            previousLockerStatus: lockerStatus,
                            sourceOfTruth: "postgres-localstack-sync",
                        },
                    });

                    return {
                        statusCode: 202,
                        body: toQueuedBookingOperationResponse(
                            operationId,
                            OperationType.BOOKING_CANCEL,
                            {
                                bookingId,
                                requestedStatus: BookingStatus.CANCELLED,
                                ...(updated ? { persistedStatus: updated.status } : {}),
                            },
                            "Booking cancellation queued"
                        ),
                    };
                } catch (error) {
                    if (error instanceof HttpError) {
                        throw error;
                    }

                    const errorMessage = error instanceof Error ? error.message : "Failed to queue booking cancel";

                    if (operationCreated) {
                        await operationRepository.updateStatus(operationId, OperationStatus.FAILED, errorMessage);
                    }
                    await logAudit({
                        req,
                        action: ActionType.BOOKING_CANCEL_FAILED,
                        actorId: userId,
                        entityId: bookingId,
                        entityType: "Booking",
                        lockerId: booking.lockerBoxId,
                        details: {
                            previousStatus: booking.status,
                            previousLockerStatus: lockerStatus,
                            reason: errorMessage,
                            sourceOfTruth: "postgres",
                        },
                    });

                    throw new HttpError(500, errorMessage);
                }
            }
        );
    }

    async endBooking(req: Request, res: Response) {
        const bookingId = req.params.id as string;
        const bookingWithLocker = await loadBookingWithLockerStatus(bookingId);

        if (!bookingWithLocker) {
            throw new HttpError(404, "Booking not found");
        }

        const { booking, lockerStatus } = bookingWithLocker;
        const userId = req.user?.userId;
        const role = req.user?.role;

        if (role === Role.USER && booking.userId !== userId) {
            throw new HttpError(403, "Access denied");
        }

        const existing = await prismaService.booking.findUnique({
            where: { bookingId },
        });

        if (!existing) {
            throw new HttpError(404, "Booking not found");
        }

        if (role === Role.USER && existing.userId !== userId) {
            throw new HttpError(403, "Access denied");
        }

        if (existing.status === BookingStatus.ENDED) {
            return sendSuccess(res, {
                bookingId: booking.bookingId,
                bookingStatus: existing.status,
                lockerStatus,
                message: "Booking already ended",
            });
        }

        if (existing.status !== BookingStatus.ACTIVE) {
            throw new HttpError(409, "Booking can be ended only while active");
        }

        if (!existing.expectedEndTime) {
            throw new HttpError(409, "Booking does not have expectedEndTime");
        }

        if (existing.expectedEndTime <= new Date()) {
            throw new HttpError(409, "Booking has expired");
        }

        if (!userId) {
            throw new HttpError(401, "Unauthorized");
        }

        return idempotencyService.execute(
            req,
            res,
            `booking-end:${bookingId}`,
            { bookingId },
            async () => {
                const operationId = uuidv4();

                try {
                    const updated = await prismaService.booking.update({
                        where: { bookingId },
                        data: {
                            status: BookingStatus.ENDED,
                            endTime: new Date(),
                        },
                    });

                    await operationRepository.create({
                        operationId,
                        userId,
                        timestamp: new Date().toISOString(),
                        status: OperationStatus.PENDING,
                        type: OperationType.LOCKER_CLOSE,
                    });

                    const requestedAt = new Date().toISOString();

                    await sendCloseLockerUserCommand({
                        operationId,
                        type: OperationType.LOCKER_CLOSE,
                        payload: {
                            userId,
                            stationId: booking.stationId,
                            lockerBoxId: booking.lockerBoxId,
                            bookingId,
                            clientRequestId: (req.headers["x-correlation-id"] as string | undefined) ?? uuidv4(),
                            requestedAt,
                            finalizeBooking: true,
                        },
                    });

                    await logAudit({
                        req,
                        action: ActionType.BOOKING_UPDATE_STATUS,
                        actorId: userId,
                        entityId: operationId,
                        entityType: "Operation",
                        lockerId: booking.lockerBoxId,
                        details: {
                            operationType: OperationType.LOCKER_CLOSE,
                            bookingId,
                            previousStatus: existing.status,
                            nextStatus: BookingStatus.ENDED,
                            previousLockerStatus: lockerStatus,
                            sourceOfTruth: "postgres-localstack-sync",
                        },
                    });

                    return {
                        statusCode: 202,
                        body: toQueuedBookingOperationResponse(
                            operationId,
                            OperationType.LOCKER_CLOSE,
                            {
                                bookingId,
                                lockerBoxId: booking.lockerBoxId,
                                stationId: booking.stationId,
                                persistedStatus: updated.status,
                                finalClose: true,
                            },
                            "Booking end queued"
                        ),
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Failed to queue booking end";

                    await operationRepository.updateStatus(operationId, OperationStatus.FAILED, errorMessage);
                    await logAudit({
                        req,
                        action: ActionType.BOOKING_UPDATE_STATUS_FAILED,
                        actorId: userId,
                        entityId: bookingId,
                        entityType: "Booking",
                        lockerId: booking.lockerBoxId,
                        details: {
                            previousStatus: existing.status,
                            nextStatus: BookingStatus.ENDED,
                            previousLockerStatus: lockerStatus,
                            reason: errorMessage,
                            sourceOfTruth: "postgres",
                        },
                    });

                    throw new HttpError(500, errorMessage);
                }
            }
        );
    }

    async getAllBookings(req: Request, res: Response) {
        const userId = req.user?.userId;

        if (!userId) {
            throw new HttpError(401, "Unauthorized");
        }

        const allBookings = await getAllBookings() as BookingRecordDto[];
        const status = req.query.status as BookingStatus | undefined;
        const lockerBoxId = req.query.lockerBoxId as string | undefined;
        const stationId = req.query.stationId as string | undefined;
        const limit = req.query.limit === undefined ? undefined : Number(req.query.limit);
        const skip = Number(req.query.skip ?? 0);
        const ownBookings = allBookings
            .filter((booking) => booking.userId === userId)
            .filter((booking) => !status || booking.status === status)
            .filter((booking) => !lockerBoxId || booking.lockerBoxId === lockerBoxId)
            .filter((booking) => !stationId || booking.stationId === stationId);
        const result = await Promise.all(
            ownBookings.slice(skip, limit === undefined ? undefined : skip + limit).map(async (booking) => {
                const locker = await getLockerCache(booking.lockerBoxId);
                return toPublicBookingResponse({
                    bookingId: booking.bookingId,
                    paymentStatus: booking.paymentStatus ?? "PENDING",
                    bookingStatus: booking.status,
                    lockerStatus: booking.lockerStatus ?? locker?.status ?? null,
                    lockerBoxId: booking.lockerBoxId,
                    stationId: booking.stationId,
                    startTime: booking.startTime ?? null,
                    expectedEndTime: booking.expectedEndTime ?? null,
                });
            })
        );

        await logAudit({
            req,
            action: ActionType.BOOKING_INFO,
            actorId: userId,
            entityId: "my-bookings",
            entityType: "Booking",
            details: {
                sourceOfTruth: "dynamodb",
                count: result.length,
                scope: "self",
                filters: {
                    status,
                    lockerBoxId,
                    stationId,
                    limit,
                    skip,
                },
            },
        });

        return sendSuccess(res, result, 200, {
            limit,
            skip,
            total: ownBookings.length,
        });
    }

    async extendBooking(req: Request, res: Response) {
        const bookingId = req.params.id as string;
        const userId = req.user?.userId;
        let operationId: string | undefined;
        let operationCreated = false;

        if (!userId) {
            throw new HttpError(401, "Unauthorized");
        }

        const nextExpectedEndTime = resolveRequestedExpectedEndTime(req);

        try {
            const bookingWithLocker = await loadBookingWithLockerStatus(bookingId);

            if (!bookingWithLocker) {
                throw new HttpError(404, "Booking not found");
            }

            const { booking, lockerStatus } = bookingWithLocker;

            if (booking.userId !== userId) {
                throw new HttpError(403, "Access denied");
            }

            if (!booking.expectedEndTime) {
                throw new HttpError(409, "Booking does not have expectedEndTime");
            }

            const currentExpectedEndTime = new Date(booking.expectedEndTime);

            if (Number.isNaN(currentExpectedEndTime.getTime())) {
                throw new HttpError(409, "Booking has invalid expectedEndTime");
            }

            if (nextExpectedEndTime <= currentExpectedEndTime) {
                throw new HttpError(400, "expectedEndTime must be later than current expectedEndTime", "VALIDATION_ERROR");
            }

            const isRegularExtension = booking.status === "ACTIVE";
            const isExpiredReactivation = booking.status === "EXPIRED";

            if (!isRegularExtension && !isExpiredReactivation) {
                throw new HttpError(
                    409,
                    "Booking can be extended only for ACTIVE or EXPIRED states"
                );
            }

            operationId = uuidv4();
            const nextBookingStatus = isExpiredReactivation ? "ACTIVE" : booking.status;
            const nextLockerStatus = isExpiredReactivation ? "OCCUPIED" : (lockerStatus ?? booking.lockerStatus ?? "UNKNOWN");

            await operationRepository.create({
                operationId,
                userId,
                timestamp: new Date().toISOString(),
                status: OperationStatus.PENDING,
                type: OperationType.BOOKING_EXTEND,
            });
            operationCreated = true;

            await sendBookingExtendToQueue({
                operationId,
                type: OperationType.BOOKING_EXTEND,
                payload: {
                    bookingId,
                    userId,
                    expectedEndTime: nextExpectedEndTime.toISOString(),
                },
            });

            await logAudit({
                req,
                action: ActionType.BOOKING_UPDATE_STATUS,
                actorId: userId,
                entityId: bookingId,
                entityType: "Booking",
                lockerId: booking.lockerBoxId,
                details: {
                    operationId,
                    currentBookingStatus: booking.status,
                    currentLockerStatus: lockerStatus,
                    nextExpectedEndTime: nextExpectedEndTime.toISOString(),
                    expectedBookingStatus: nextBookingStatus,
                    expectedLockerStatus: nextLockerStatus,
                    sourceOfTruth: "lambda-dynamodb",
                },
            });

            return sendSuccess(
                res,
                toQueuedBookingOperationResponse(
                    operationId,
                    OperationType.BOOKING_EXTEND,
                    {
                        bookingId: booking.bookingId,
                        lockerBoxId: booking.lockerBoxId,
                        currentBookingStatus: booking.status,
                        currentLockerStatus: lockerStatus,
                        requestedExpectedEndTime: nextExpectedEndTime.toISOString(),
                    }
                ),
                202
            );
        } catch (error) {
            if (operationCreated && operationId) {
                await operationRepository.updateStatus(
                    operationId,
                    OperationStatus.FAILED,
                    error instanceof Error ? error.message : "Failed to queue booking extend"
                );
            }

            await logAudit({
                req,
                action: ActionType.BOOKING_UPDATE_STATUS_FAILED,
                actorId: userId,
                entityId: bookingId,
                entityType: "Booking",
                details: {
                    reason: error instanceof Error ? error.message : "Unknown error",
                    sourceOfTruth: "dynamodb",
                },
            });

            throw error;
        }
    }
}

export const bookingService = new BookingService();
