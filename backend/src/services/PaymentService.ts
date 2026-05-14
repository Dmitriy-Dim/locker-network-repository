import crypto, { randomUUID } from "crypto";

import {Request, Response} from "express";
import {BookingStatus, PaymentStatus, Prisma} from "@prisma/client";

import { BookingRecordDto } from "../contracts/booking.dto";
import { HttpError } from "../errorHandler/HttpError";
import { logger } from "../Logger/winston";
import { sendSuccess } from "../utils/response";
import { env } from "../config/env";
import {
    buildRequestAlertContext,
    emitSecurityAlert,
    SecurityAlertEventType,
    SecurityAlertSeverity,
} from "../utils/securityAlert";

import { getBooking } from "./dynamoService";
import { OperationType } from "./dto/operationDto";
import { prismaService } from "./prismaService";
import { sendBookingExtendConfirmToQueue, sendPaymentConfirmToQueue } from "./sqsService";
import {parseDate} from "./AuditLogService";

type StripeEventObject = {
    id?: string;
    metadata?: Record<string, string | undefined>;
    client_reference_id?: string | null;
    payment_intent?: string | null;
    amount_total?: number | null;
    amount_received?: number | null;
    amount?: number | null;
    currency?: string | null;
};

type StripeWebhookEvent = {
    id: string;
    type: string;
    created?: number;
    data?: {
        object?: StripeEventObject;
    };
};

type PaymentWebhookPayload = {
    bookingId: string;
    operationId?: string;
    paymentSessionId: string;
    providerPaymentId: string;
    amount: number;
    currency: string;
    paymentFlow: "BOOKING_INIT" | "BOOKING_EXTEND";
};

function emitPaymentAlert(
    req: Request,
    eventType: SecurityAlertEventType,
    severity: SecurityAlertSeverity,
    reason: string,
    details?: Record<string, unknown>
) {
    emitSecurityAlert({
        ...buildRequestAlertContext(req),
        eventType,
        severity,
        reason,
        details: {
            provider: "stripe",
            ...details,
        },
    });
}

function toDecimal(value: number) {
    return new Prisma.Decimal(value);
}

function parseStripeSignature(signatureHeader: string) {
    const parts = signatureHeader.split(",").map((part) => part.trim());
    const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
    const signatures = parts
        .filter((part) => part.startsWith("v1="))
        .map((part) => part.slice(3))
        .filter(Boolean);

    if (!timestamp || signatures.length === 0) {
        throw new HttpError(400, "Invalid Stripe signature header");
    }

    return {
        timestamp,
        signatures,
    };
}

function verifyStripeSignature(rawBody: Buffer, signatureHeader: string) {
    const secret = env.STRIPE_WEBHOOK_SECRET;

    if (!secret) {
        throw new HttpError(500, "STRIPE_WEBHOOK_SECRET is not configured");
    }

    const { timestamp, signatures } = parseStripeSignature(signatureHeader);
    const signatureTimestamp = Number(timestamp);

    if (!Number.isFinite(signatureTimestamp)) {
        throw new HttpError(400, "Invalid Stripe signature timestamp");
    }

    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - signatureTimestamp);

    if (ageSeconds > env.STRIPE_WEBHOOK_TOLERANCE_SECONDS) {
        throw new HttpError(400, "Stripe signature timestamp is outside tolerance");
    }

    const payloadToSign = `${timestamp}.${rawBody.toString("utf8")}`;
    const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(payloadToSign)
        .digest("hex");

    const expected = Buffer.from(expectedSignature, "utf8");

    const isValid = signatures.some((signature) => {
        const received = Buffer.from(signature, "utf8");
        return received.length === expected.length && crypto.timingSafeEqual(expected, received);
    });

    if (!isValid) {
        throw new HttpError(400, "Stripe signature verification failed");
    }
}

function toAmountMajorUnits(amountMinor: number) {
    return Number((amountMinor / 100).toFixed(2));
}

function extractPaymentPayload(event: StripeWebhookEvent): PaymentWebhookPayload | null {
    if (event.type !== "checkout.session.completed") {
        return null;
    }

    const object = event.data?.object;

    if (!object) {
        return null;
    }

    const bookingId = object.metadata?.bookingId ?? object.client_reference_id ?? undefined;
    const operationId = object.metadata?.operationId ?? undefined;
    const paymentSessionId = object.id ?? object.metadata?.paymentSessionId ?? undefined;
    const providerPaymentId = object.payment_intent ?? object.metadata?.providerPaymentId ?? undefined;
    const amountMinor = object.amount_total ?? object.amount_received ?? object.amount ?? undefined;
    const currency = object.currency ?? undefined;
    const paymentFlowRaw = object.metadata?.paymentFlow;
    const paymentFlow = paymentFlowRaw === "BOOKING_EXTEND" ? "BOOKING_EXTEND" : "BOOKING_INIT";

    if (!bookingId || !paymentSessionId || !providerPaymentId || typeof amountMinor !== "number" || !currency) {
        throw new HttpError(400, "Stripe event does not contain required payment fields");
    }

    return {
        bookingId,
        ...(operationId ? { operationId } : {}),
        paymentSessionId,
        providerPaymentId,
        amount: toAmountMajorUnits(amountMinor),
        currency: currency.toUpperCase(),
        paymentFlow,
    };
}

export class PaymentService {
    private async finalizePaymentInRds(stagedBooking: BookingRecordDto, paymentPayload: PaymentWebhookPayload, paidAtIso: string) {
        const paidAt = new Date(paidAtIso);

        return prismaService.$transaction(async (tx) => {
            const existingBooking = await tx.booking.findUnique({
                where: { bookingId: stagedBooking.bookingId },
                include: { payments: true },
            });

            const duplicatedPayment = existingBooking?.payments.find(
                (payment) => payment.providerPaymentId === paymentPayload.providerPaymentId
            );

            if (existingBooking && duplicatedPayment) {
                return {
                    created: false,
                    booking: existingBooking,
                    payment: duplicatedPayment,
                };
            }

            const bookingData = {
                userId: stagedBooking.userId,
                lockerBoxId: stagedBooking.lockerBoxId,
                stationId: stagedBooking.stationId,
                status: BookingStatus.ACTIVE,
                startTime: paidAt,
                expectedEndTime: new Date(stagedBooking.expectedEndTime),
                totalPrice: toDecimal(paymentPayload.amount),
            };

            const booking = existingBooking
                ? await tx.booking.update({
                    where: { bookingId: stagedBooking.bookingId },
                    data: bookingData,
                })
                : await tx.booking.create({
                    data: {
                        bookingId: stagedBooking.bookingId,
                        ...bookingData,
                    },
                });

            const payment = await tx.payment.create({
                data: {
                    bookingId: stagedBooking.bookingId,
                    status: PaymentStatus.PAID,
                    provider: stagedBooking.paymentProvider ?? "stripe",
                    providerPaymentId: paymentPayload.providerPaymentId,
                    amount: toDecimal(paymentPayload.amount),
                    currency: paymentPayload.currency,
                    paidAt,
                },
            });

            await tx.auditLog.create({
                data: {
                    action: "PAYMENT_CONFIRM",
                    entityType: "Booking",
                    entityId: stagedBooking.bookingId,
                    lockerId: stagedBooking.lockerBoxId,
                    details: {
                        bookingId: stagedBooking.bookingId,
                        paymentSessionId: paymentPayload.paymentSessionId,
                        providerPaymentId: paymentPayload.providerPaymentId,
                        amount: paymentPayload.amount,
                        currency: paymentPayload.currency,
                    },
                },
            });

            logger.info("Payment finalized booking in RDS", {
                bookingId: stagedBooking.bookingId,
                lockerBoxId: stagedBooking.lockerBoxId,
                paymentSessionId: paymentPayload.paymentSessionId,
                providerPaymentId: paymentPayload.providerPaymentId,
                amount: paymentPayload.amount,
                currency: paymentPayload.currency,
                created: !existingBooking,
                previousStatus: existingBooking?.status,
                persistedStatus: booking.status,
                sourceOfTruth: "dynamodb",
                target: "postgres",
            });

            return {
                created: !existingBooking,
                booking,
                payment,
            };
        });
    }

    private async finalizeExtendPaymentInRds(stagedBooking: BookingRecordDto, paymentPayload: PaymentWebhookPayload, paidAtIso: string) {
        const paidAt = new Date(paidAtIso);
        const nextExpectedEndTime = stagedBooking.pendingExtendEndTime;

        if (!nextExpectedEndTime) {
            throw new HttpError(409, "Pending booking extension not found");
        }

        return prismaService.$transaction(async (tx) => {
            const existingBooking = await tx.booking.findUnique({
                where: { bookingId: stagedBooking.bookingId },
                include: { payments: true },
            });

            if (!existingBooking) {
                throw new HttpError(404, "Booking not found in RDS");
            }

            const duplicatedPayment = existingBooking.payments.find(
                (payment) => payment.providerPaymentId === paymentPayload.providerPaymentId
            );

            if (duplicatedPayment) {
                return {
                    updated: false,
                    booking: existingBooking,
                    payment: duplicatedPayment,
                };
            }

            const nextTotalPrice = existingBooking.totalPrice === null
                ? toDecimal(paymentPayload.amount)
                : existingBooking.totalPrice.plus(toDecimal(paymentPayload.amount));

            const booking = await tx.booking.update({
                where: { bookingId: stagedBooking.bookingId },
                data: {
                    expectedEndTime: new Date(nextExpectedEndTime),
                    totalPrice: nextTotalPrice,
                    ...(existingBooking.status === BookingStatus.EXPIRED
                        ? { status: BookingStatus.ACTIVE }
                        : {}),
                },
            });

            const payment = await tx.payment.create({
                data: {
                    bookingId: stagedBooking.bookingId,
                    status: PaymentStatus.PAID,
                    provider: stagedBooking.paymentProvider ?? "stripe",
                    providerPaymentId: paymentPayload.providerPaymentId,
                    amount: toDecimal(paymentPayload.amount),
                    currency: paymentPayload.currency,
                    paidAt,
                },
            });

            await tx.auditLog.create({
                data: {
                    action: "PAYMENT_CONFIRM",
                    entityType: "Booking",
                    entityId: stagedBooking.bookingId,
                    lockerId: stagedBooking.lockerBoxId,
                    details: {
                        bookingId: stagedBooking.bookingId,
                        paymentSessionId: paymentPayload.paymentSessionId,
                        providerPaymentId: paymentPayload.providerPaymentId,
                        amount: paymentPayload.amount,
                        currency: paymentPayload.currency,
                        paymentFlow: paymentPayload.paymentFlow,
                        pendingExtendEndTime: nextExpectedEndTime,
                    },
                },
            });

            return {
                updated: true,
                booking,
                payment,
            };
        });
    }

    async handleStripeWebhook(req: Request, res: Response) {
        if (!Buffer.isBuffer(req.body)) {
            emitPaymentAlert(
                req,
                "PAYMENT_WEBHOOK_INVALID_PAYLOAD",
                "MEDIUM",
                "Stripe webhook did not use raw request body"
            );
            throw new HttpError(400, "Stripe webhook requires raw request body");
        }

        const signatureHeader = req.headers["stripe-signature"];

        if (typeof signatureHeader !== "string") {
            emitPaymentAlert(
                req,
                "PAYMENT_WEBHOOK_SIGNATURE_INVALID",
                "CRITICAL",
                "Missing Stripe signature header"
            );
            throw new HttpError(400, "Missing Stripe signature header");
        }

        try {
            verifyStripeSignature(req.body, signatureHeader);
        } catch (error) {
            emitPaymentAlert(
                req,
                "PAYMENT_WEBHOOK_SIGNATURE_INVALID",
                "CRITICAL",
                error instanceof Error ? error.message : "Stripe signature verification failed"
            );
            throw error;
        }

        let event: StripeWebhookEvent;

        try {
            event = JSON.parse(req.body.toString("utf8")) as StripeWebhookEvent;
        } catch (error) {
            emitPaymentAlert(
                req,
                "PAYMENT_WEBHOOK_INVALID_PAYLOAD",
                "MEDIUM",
                "Stripe webhook body is not valid JSON",
                { error: error instanceof Error ? error.message : "Unknown error" }
            );
            throw new HttpError(400, "Invalid Stripe event payload");
        }

        let paymentPayload: PaymentWebhookPayload | null;

        try {
            paymentPayload = extractPaymentPayload(event);
        } catch (error) {
            emitPaymentAlert(
                req,
                "PAYMENT_WEBHOOK_INVALID_PAYLOAD",
                "MEDIUM",
                error instanceof Error ? error.message : "Stripe event does not contain required payment fields",
                { eventId: event.id, eventType: event.type }
            );
            throw error;
        }

        if (!paymentPayload) {
            return sendSuccess(res, {
                received: true,
                ignored: true,
                eventId: event.id,
                eventType: event.type,
            });
        }

        const paymentConfirmedAt = new Date(
            typeof event.created === "number" ? event.created * 1000 : Date.now()
        ).toISOString();
        const stagedBooking = await getBooking(paymentPayload.bookingId) as BookingRecordDto | undefined;

        if (!stagedBooking) {
            emitPaymentAlert(
                req,
                "PAYMENT_BOOKING_NOT_FOUND",
                "MEDIUM",
                "Paid Stripe booking was not found in staged booking storage",
                {
                    eventId: event.id,
                    bookingId: paymentPayload.bookingId,
                    paymentSessionId: paymentPayload.paymentSessionId,
                    paymentFlow: paymentPayload.paymentFlow,
                }
            );
            throw new HttpError(404, "Booking not found");
        }

        const ttl = typeof stagedBooking.ttl === "number" ? stagedBooking.ttl : undefined;
        const nowEpochSeconds = Math.floor(Date.now() / 1000);

        if (paymentPayload.paymentFlow === "BOOKING_INIT" && ttl !== undefined && ttl < nowEpochSeconds) {
            emitPaymentAlert(
                req,
                "PAYMENT_BOOKING_EXPIRED",
                "MEDIUM",
                "Stripe payment arrived for expired staged booking",
                {
                    eventId: event.id,
                    bookingId: paymentPayload.bookingId,
                    paymentSessionId: paymentPayload.paymentSessionId,
                    ttl,
                    nowEpochSeconds,
                }
            );
            throw new HttpError(409, "Booking TTL expired");
        }

        let created = false;
        let operationId = stagedBooking?.operationId ?? randomUUID();

        if (paymentPayload.paymentFlow === "BOOKING_EXTEND") {
            if (!paymentPayload.operationId) {
                emitPaymentAlert(
                    req,
                    "PAYMENT_WEBHOOK_INVALID_PAYLOAD",
                    "MEDIUM",
                    "Stripe booking extension event does not contain operationId",
                    {
                        eventId: event.id,
                        bookingId: paymentPayload.bookingId,
                        paymentSessionId: paymentPayload.paymentSessionId,
                    }
                );
                throw new HttpError(400, "Stripe event does not contain required booking extension operationId");
            }

            if (stagedBooking.extendPaymentSessionId !== paymentPayload.paymentSessionId) {
                emitPaymentAlert(
                    req,
                    "PAYMENT_SESSION_MISMATCH",
                    "CRITICAL",
                    "extend paymentSessionId does not match staged booking",
                    {
                        eventId: event.id,
                        bookingId: paymentPayload.bookingId,
                        expectedPaymentSessionId: stagedBooking.extendPaymentSessionId,
                        receivedPaymentSessionId: paymentPayload.paymentSessionId,
                        paymentFlow: paymentPayload.paymentFlow,
                    }
                );
                throw new HttpError(409, "extend paymentSessionId does not match staged booking");
            }

            if (stagedBooking.extendPaymentStatus === "PAID") {
                emitPaymentAlert(
                    req,
                    "PAYMENT_ALREADY_PROCESSED",
                    "LOW",
                    "Stripe booking extension event was already paid",
                    {
                        eventId: event.id,
                        bookingId: paymentPayload.bookingId,
                        paymentSessionId: paymentPayload.paymentSessionId,
                        paymentFlow: paymentPayload.paymentFlow,
                    }
                );
                throw new HttpError(409, "Booking extension already paid");
            }

            await this.finalizeExtendPaymentInRds(stagedBooking, paymentPayload, paymentConfirmedAt);
            operationId = paymentPayload.operationId;

            await sendBookingExtendConfirmToQueue({
                operationId,
                type: OperationType.BOOKING_EXTEND_CONFIRM,
                payload: {
                    bookingId: paymentPayload.bookingId,
                    userId: stagedBooking.userId,
                    expectedEndTime: stagedBooking.pendingExtendEndTime ?? stagedBooking.expectedEndTime,
                    paymentSessionId: paymentPayload.paymentSessionId,
                    providerPaymentId: paymentPayload.providerPaymentId,
                    amount: paymentPayload.amount,
                    currency: paymentPayload.currency,
                },
            });
        } else {
            if (stagedBooking.paymentSessionId !== paymentPayload.paymentSessionId) {
                emitPaymentAlert(
                    req,
                    "PAYMENT_SESSION_MISMATCH",
                    "CRITICAL",
                    "paymentSessionId does not match staged booking",
                    {
                        eventId: event.id,
                        bookingId: paymentPayload.bookingId,
                        expectedPaymentSessionId: stagedBooking.paymentSessionId,
                        receivedPaymentSessionId: paymentPayload.paymentSessionId,
                        paymentFlow: paymentPayload.paymentFlow,
                    }
                );
                throw new HttpError(409, "paymentSessionId does not match staged booking");
            }

            if (stagedBooking.status === "ACTIVE") {
                emitPaymentAlert(
                    req,
                    "PAYMENT_ALREADY_PROCESSED",
                    "LOW",
                    "Stripe booking event was already active",
                    {
                        eventId: event.id,
                        bookingId: paymentPayload.bookingId,
                        paymentSessionId: paymentPayload.paymentSessionId,
                        bookingStatus: stagedBooking.status,
                    }
                );
                throw new HttpError(409, "Booking already active");
            }

            if (stagedBooking.paymentStatus === "PAID" && stagedBooking.status !== "PAYMENT_CONFIRMED") {
                emitPaymentAlert(
                    req,
                    "PAYMENT_ALREADY_PROCESSED",
                    "LOW",
                    "Stripe booking event was already paid",
                    {
                        eventId: event.id,
                        bookingId: paymentPayload.bookingId,
                        paymentSessionId: paymentPayload.paymentSessionId,
                        bookingStatus: stagedBooking.status,
                        paymentStatus: stagedBooking.paymentStatus,
                    }
                );
                throw new HttpError(409, "Booking already paid");
            }

            const finalized = await this.finalizePaymentInRds(stagedBooking, paymentPayload, paymentConfirmedAt);
            created = finalized.created;

            await sendPaymentConfirmToQueue({
                operationId,
                type: OperationType.PAYMENT_CONFIRM,
                payload: paymentPayload,
            });
        }

        return sendSuccess(res, {
            received: true,
            accepted: true,
            bookingId: paymentPayload.bookingId,
            paymentFlow: paymentPayload.paymentFlow,
            operationId,
            rdsFinalized: true,
            created,
            paymentConfirmedAt,
            eventId: event.id,
        });
    }


    async getAllPayments(req: Request, res: Response) {
        const limit = req.query.limit === undefined ? undefined : Number(req.query.limit);
        const skip = Number(req.query.skip ?? 0);
        const bookingId = req.query.bookingId as string | undefined;
        const userId = req.query.userId as string | undefined;
        const status = req.query.status as PaymentStatus | undefined;
        const provider = req.query.provider as string | undefined;
        const providerPaymentId = req.query.providerPaymentId as string | undefined;
        const from = parseDate(req.query.from, new Date(Date.now() - (24 * 60 * 60 * 1000)), "from");
        const to = parseDate(req.query.to, new Date(), "to");


        const where: Prisma.PaymentWhereInput = {
            createdAt: {
                gte: from,
                lte: to,
            },
            ...(bookingId && { bookingId }),
            ...(status && { status }),
            ...(provider && { provider }),
            ...(providerPaymentId && { providerPaymentId }),
            ...(userId && {
                booking: {
                    userId,
                },
            }),
        };

        const payments = await prismaService.payment.findMany({
            where,
            select: {
                paymentId: true,
                bookingId: true,
                booking: {
                    select: {
                        userId: true,
                    },
                },
                status: true,
                provider: true,
                providerPaymentId: true,
                amount: true,
                currency:true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: {
                createdAt: "desc",
            },
            skip,
            ...(limit !== undefined && {take: limit}),
        });


        const total = await prismaService.payment.count({where});

        res.setHeader("x-total-count", total);
        res.setHeader("x-skip", skip);
        if (limit !== undefined) {
            res.setHeader("x-limit", limit);
        }

        return sendSuccess(res,payments)
    }

    async getOnePayment(req: Request, res: Response) {
        const paymentId = req.params.id as string | undefined;
        const payment = await prismaService.payment.findUnique({
            where: {paymentId},
            select: {
                paymentId: true,
                bookingId: true,
                booking: {
                    select: {
                        userId: true,
                    },
                },
                status: true,
                provider: true,
                providerPaymentId: true,
                amount: true,
                currency:true,
                createdAt: true,
                updatedAt: true,
            }
        })
        if (!payment) {
            throw new HttpError(404, "Payment not found.");
        }

        return sendSuccess(res, payment);
    }
}

export const paymentService = new PaymentService();
