import crypto, { randomUUID } from "crypto";

import { Request, Response } from "express";
import { BookingStatus, PaymentStatus, Prisma } from "@prisma/client";

import { BookingRecordDto } from "../contracts/booking.dto";
import { HttpError } from "../errorHandler/HttpError";
import { sendSuccess } from "../utils/response";
import { env } from "../config/env";

import { getBooking } from "./dynamoService";
import { OperationType } from "./dto/operationDto";
import { prismaService } from "./prismaService";
import { sendBookingExtendConfirmToQueue, sendPaymentConfirmToQueue } from "./sqsService";

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

            const booking = existingBooking ?? await tx.booking.create({
                data: {
                    bookingId: stagedBooking.bookingId,
                    userId: stagedBooking.userId,
                    lockerBoxId: stagedBooking.lockerBoxId,
                    stationId: stagedBooking.stationId,
                    status: BookingStatus.ACTIVE,
                    startTime: paidAt,
                    expectedEndTime: new Date(stagedBooking.expectedEndTime),
                    totalPrice: toDecimal(paymentPayload.amount),
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

            return {
                created: true,
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
            throw new HttpError(400, "Stripe webhook requires raw request body");
        }

        const signatureHeader = req.headers["stripe-signature"];

        if (typeof signatureHeader !== "string") {
            throw new HttpError(400, "Missing Stripe signature header");
        }

        verifyStripeSignature(req.body, signatureHeader);

        const event = JSON.parse(req.body.toString("utf8")) as StripeWebhookEvent;
        const paymentPayload = extractPaymentPayload(event);

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
            throw new HttpError(404, "Booking not found");
        }

        const ttl = typeof stagedBooking.ttl === "number" ? stagedBooking.ttl : undefined;
        const nowEpochSeconds = Math.floor(Date.now() / 1000);

        if (ttl !== undefined && ttl < nowEpochSeconds) {
            throw new HttpError(409, "Booking TTL expired");
        }

        let created = false;
        let operationId = stagedBooking?.operationId ?? randomUUID();

        if (paymentPayload.paymentFlow === "BOOKING_EXTEND") {
            if (!paymentPayload.operationId) {
                throw new HttpError(400, "Stripe event does not contain required booking extension operationId");
            }

            if (stagedBooking.extendPaymentSessionId !== paymentPayload.paymentSessionId) {
                throw new HttpError(409, "extend paymentSessionId does not match staged booking");
            }

            if (stagedBooking.extendPaymentStatus === "PAID") {
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
                throw new HttpError(409, "paymentSessionId does not match staged booking");
            }

            if (stagedBooking.status === "ACTIVE") {
                throw new HttpError(409, "Booking already active");
            }

            if (stagedBooking.paymentStatus === "PAID" && stagedBooking.status !== "PAYMENT_CONFIRMED") {
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
}

export const paymentService = new PaymentService();
