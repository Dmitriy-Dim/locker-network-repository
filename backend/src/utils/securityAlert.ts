import { randomUUID } from "crypto";

import { Request } from "express";

import { env } from "../config/env";
import { logger } from "../Logger/winston";

export type SecurityAlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type SecurityAlertEventType =
    | "AUTH_MISSING_TOKEN"
    | "AUTH_INVALID_TOKEN"
    | "AUTH_FORBIDDEN"
    | "AUTH_INVALID_CREDENTIALS"
    | "AUTH_USER_NOT_REGISTERED"
    | "AUTH_REFRESH_FAILED"
    | "ADMIN_ROLE_CHANGE"
    | "ADMIN_ROLE_CHANGE_FAILED"
    | "RATE_LIMIT_EXCEEDED"
    | "INTERNAL_SERVER_ERROR"
    | "UNCAUGHT_EXCEPTION"
    | "UNHANDLED_REJECTION"
    | "SERVER_STARTUP_FAILED"
    | "AWS_CREDENTIALS_FAILED"
    | "SQS_SEND_FAILED"
    | "SECURITY_EVENT_PIPELINE_FAILED"
    | "PAYMENT_WEBHOOK_SIGNATURE_INVALID"
    | "PAYMENT_WEBHOOK_INVALID_PAYLOAD"
    | "PAYMENT_SESSION_MISMATCH"
    | "PAYMENT_BOOKING_NOT_FOUND"
    | "PAYMENT_BOOKING_EXPIRED"
    | "PAYMENT_ALREADY_PROCESSED";

interface SecurityAlertParams {
    eventType: SecurityAlertEventType;
    severity: SecurityAlertSeverity;
    reason: string;
    source?: string;
    actorId?: string | null;
    correlationId?: string;
    ipAddress?: string;
    userAgent?: string;
    method?: string;
    path?: string;
    details?: Record<string, unknown>;
}

const redactKeyFragments = [
    "password",
    "token",
    "authorization",
    "cookie",
    "signature",
    "secret",
];

function shouldRedactKey(key: string) {
    const normalizedKey = key.toLowerCase();

    return redactKeyFragments.some((fragment) => normalizedKey.includes(fragment));
}

function redactValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => redactValue(item));
    }

    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
                key,
                shouldRedactKey(key) ? "[REDACTED]" : redactValue(nestedValue),
            ])
        );
    }

    return value;
}

function safeDetails(details?: Record<string, unknown>) {
    return details ? redactValue(details) as Record<string, unknown> : undefined;
}

function getSafePath(req: Request) {
    return req.path || req.originalUrl?.split("?")[0] || req.originalUrl;
}

export function getRequestIpAddress(req: Request) {
    const forwardedFor = req.headers?.["x-forwarded-for"];

    if (typeof forwardedFor === "string" && forwardedFor.trim().length > 0) {
        return forwardedFor.split(",")[0]?.trim() ?? req.ip ?? "unknown";
    }

    return req.ip ?? "unknown";
}

export function buildRequestAlertContext(req: Request) {
    return {
        actorId: req.user?.userId,
        correlationId: req.correlationId ?? (req.headers?.["x-correlation-id"] as string | undefined),
        ipAddress: getRequestIpAddress(req),
        userAgent: req.get?.("user-agent") ?? "unknown",
        method: req.method,
        path: getSafePath(req),
    };
}

export function emitSecurityAlert({
    eventType,
    severity,
    reason,
    source = "backend",
    actorId,
    correlationId,
    ipAddress,
    userAgent,
    method,
    path,
    details,
}: SecurityAlertParams) {
    const payload = {
        category: "SECURITY_ALERT",
        schemaVersion: 1,
        severity,
        eventId: randomUUID(),
        eventType,
        occurredAt: new Date().toISOString(),
        source,
        environment: env.NODE_ENV,
        ...(actorId && { actorId }),
        ...(correlationId && { correlationId }),
        ...(ipAddress && { ipAddress }),
        ...(userAgent && { userAgent }),
        ...(method && { method }),
        ...(path && { path }),
        reason,
        ...(details && { details: safeDetails(details) }),
    };

    logger.log(severity === "CRITICAL" || severity === "HIGH" ? "error" : "warn", "SECURITY_ALERT", payload);
}

export function getErrorDetails(error: unknown) {
    if (!(error instanceof Error)) {
        return { errorMessage: "Unknown error" };
    }

    const knownError = error as Error & { code?: string; clientVersion?: string };

    return {
        errorName: error.name,
        errorMessage: error.message,
        ...(knownError.code && { errorCode: knownError.code }),
        ...(knownError.clientVersion && { clientVersion: knownError.clientVersion }),
    };
}
