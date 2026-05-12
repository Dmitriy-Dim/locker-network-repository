import {Request} from "express";

import {
    buildRequestAlertContext,
    emitSecurityAlert,
    SecurityAlertSeverity,
} from "../utils/securityAlert";

export enum SecurityEventType {
    AUTH_MISSING_TOKEN = "AUTH_MISSING_TOKEN",
    AUTH_INVALID_TOKEN = "AUTH_INVALID_TOKEN",
    AUTH_FORBIDDEN = "AUTH_FORBIDDEN",
    AUTH_INVALID_CREDENTIALS = "AUTH_INVALID_CREDENTIALS",
    AUTH_USER_NOT_REGISTERED = "AUTH_USER_NOT_REGISTERED",
    AUTH_REFRESH_FAILED = "AUTH_REFRESH_FAILED",
    ADMIN_ROLE_CHANGE = "ADMIN_ROLE_CHANGE",
    ADMIN_ROLE_CHANGE_FAILED = "ADMIN_ROLE_CHANGE_FAILED",
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
    INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR",
    UNCAUGHT_EXCEPTION = "UNCAUGHT_EXCEPTION",
    UNHANDLED_REJECTION = "UNHANDLED_REJECTION",
    SERVER_STARTUP_FAILED = "SERVER_STARTUP_FAILED",
    AWS_CREDENTIALS_FAILED = "AWS_CREDENTIALS_FAILED",
    SQS_SEND_FAILED = "SQS_SEND_FAILED",
    SECURITY_EVENT_PIPELINE_FAILED = "SECURITY_EVENT_PIPELINE_FAILED",
    PAYMENT_WEBHOOK_SIGNATURE_INVALID = "PAYMENT_WEBHOOK_SIGNATURE_INVALID",
    PAYMENT_WEBHOOK_INVALID_PAYLOAD = "PAYMENT_WEBHOOK_INVALID_PAYLOAD",
    PAYMENT_SESSION_MISMATCH = "PAYMENT_SESSION_MISMATCH",
    PAYMENT_BOOKING_NOT_FOUND = "PAYMENT_BOOKING_NOT_FOUND",
    PAYMENT_BOOKING_EXPIRED = "PAYMENT_BOOKING_EXPIRED",
    PAYMENT_ALREADY_PROCESSED = "PAYMENT_ALREADY_PROCESSED",
}

interface LogSecurityEventParams {
    req: Request;
    eventType: SecurityEventType;
    reason: string;
    operationId?: string;
    actorId?: string;
    severity?: SecurityAlertSeverity;
    details?: Record<string, unknown>;
}

function defaultSeverity(eventType: SecurityEventType): SecurityAlertSeverity {
    switch (eventType) {
        case SecurityEventType.UNCAUGHT_EXCEPTION:
        case SecurityEventType.UNHANDLED_REJECTION:
        case SecurityEventType.SERVER_STARTUP_FAILED:
        case SecurityEventType.PAYMENT_WEBHOOK_SIGNATURE_INVALID:
        case SecurityEventType.PAYMENT_SESSION_MISMATCH:
        case SecurityEventType.ADMIN_ROLE_CHANGE:
        case SecurityEventType.ADMIN_ROLE_CHANGE_FAILED:
            return "CRITICAL";
        case SecurityEventType.AUTH_FORBIDDEN:
        case SecurityEventType.AUTH_INVALID_TOKEN:
        case SecurityEventType.RATE_LIMIT_EXCEEDED:
        case SecurityEventType.INTERNAL_SERVER_ERROR:
        case SecurityEventType.AWS_CREDENTIALS_FAILED:
        case SecurityEventType.SQS_SEND_FAILED:
        case SecurityEventType.SECURITY_EVENT_PIPELINE_FAILED:
            return "HIGH";
        case SecurityEventType.AUTH_MISSING_TOKEN:
        case SecurityEventType.AUTH_INVALID_CREDENTIALS:
        case SecurityEventType.AUTH_USER_NOT_REGISTERED:
        case SecurityEventType.AUTH_REFRESH_FAILED:
        case SecurityEventType.PAYMENT_WEBHOOK_INVALID_PAYLOAD:
        case SecurityEventType.PAYMENT_BOOKING_NOT_FOUND:
        case SecurityEventType.PAYMENT_BOOKING_EXPIRED:
        case SecurityEventType.PAYMENT_ALREADY_PROCESSED:
            return "MEDIUM";
        default:
            return "LOW";
    }
}

export async function logSecurityEvent({
                                           req,
                                           eventType,
                                           reason,
                                           actorId,
                                           severity,
                                           details,
                                           operationId
                                       }: LogSecurityEventParams): Promise<void> {
    const alertContext = buildRequestAlertContext(req);
    const alertSeverity = severity ?? defaultSeverity(eventType);
    const resolvedActorId = actorId ?? alertContext.actorId;

    emitSecurityAlert({
        ...alertContext,
        actorId: resolvedActorId,
        eventType,
        severity: alertSeverity,
        reason,
        details,
        operationId
    });
}
