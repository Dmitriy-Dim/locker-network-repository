import { Request } from 'express';
import { Prisma } from '@prisma/client';

import { prismaService } from '../services/prismaService';
import {auditLogger} from '../Logger/winston';

type AuditAction =
    | 'USER_LOGIN'
    | 'USER_LOGIN_FAILED'
    | 'USER_LOGOUT'
    | 'USER_REGISTER'
    | 'USER_ROLE_UPDATE'
    | 'USER_ROLE_UPDATE_FAILED'
    | 'USER_DELETE'
    | 'USER_DELETE_FAILED'
    | 'USER_RESTORE'
    | 'USER_RESTORE_FAILED'
    | 'AUDIT_LOG_READ'
    | 'TOKEN_REFRESH'
    | 'TOKEN_REVOKED'
    | 'OPERATION_CREATE'
    | 'OPERATION_INFO'
    | 'OPERATION_INFO_FAILED'
    | 'HEALTH_CHECK'
    | 'OPERATION_CREATE_FAILED'
    | 'LOCKER_CREATE'
    | 'LOCKER_CREATE_FAILED'
    | 'LOCKER_DELETE'
    | 'LOCKER_DELETE_FAILED'
    | 'LOCKER_UPDATE_STATUS'
    | 'LOCKER_UPDATE_STATUS_FAILED'
    | 'LOCKER_UPDATE_TECH_STATUS'
    | 'LOCKER_UPDATE_TECH_STATUS_FAILED'
    | 'STATION_CREATE'
    | 'STATION_CREATE_FAILED'
    | 'STATION_DELETE'
    | 'STATION_DELETE_FAILED'
    | 'STATION_UPDATE_STATUS'
    | 'STATION_UPDATE_STATUS_FAILED'
    | 'BOOKING_INIT'
    | 'BOOKING_INIT_FAILED'
    | 'BOOKING_INFO'
    | 'BOOKING_INFO_FAILED'
    | 'BOOKING_CANCEL'
    | 'BOOKING_CANCEL_FAILED'
    | 'BOOKING_EXPIRE'
    | 'BOOKING_EXPIRE_FAILED'
    | 'BOOKING_UPDATE_STATUS'
    | 'BOOKING_UPDATE_STATUS_FAILED'
    | "CITY_CREATE"
    | 'CITY_CREATE_FAILED'
    | 'CITY_DELETE'
    | 'CITY_DELETE_FAILED'
    | 'CITY_UPDATE'
    | 'CITY_UPDATE_FAILED'
    | "CITY_RESTORE"
    | "CITY_RESTORE_FAILED"
    | 'PRICE_CREATE'
    | 'PRICE_CREATE_FAILED'
    | 'PRICE_UPDATE'
    | 'PRICE_UPDATE_FAILED'
    | 'LOCKER_OPEN_USER'
    | 'LOCKER_OPEN_USER_FAILED'
    | 'LOCKER_CLOSE_USER'
    | 'LOCKER_CLOSE_USER_FAILED'
    | "LOCKER_OPEN_OPERATOR"
    | 'LOCKER_OPEN_OPERATOR_FAILED'
    | "LOCKER_CLOSE_OPERATOR"
    | 'LOCKER_CLOSE_OPERATOR_FAILED';

interface AuditParams {
    req: Request;
    action: AuditAction;
    actorId?: string;
    entityId: string;
    entityType?: string;
    lockerId?: string;
    details?: Record<string, unknown>;
}

const sensitiveKeyFragments = [
    "password",
    "token",
    "authorization",
    "cookie",
    "signature",
    "secret",
    "apiKey",
    "apikey",
    "privateKey",
];

function shouldRedactKey(key: string) {
    const normalizedKey = key.toLowerCase();

    return sensitiveKeyFragments.some((fragment) => normalizedKey.includes(fragment.toLowerCase()));
}

export function sanitizeAuditDetails(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => sanitizeAuditDetails(item));
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
                key,
                shouldRedactKey(key) ? "[REDACTED]" : sanitizeAuditDetails(nestedValue),
            ])
        );
    }

    return value;
}

export const logAudit = async ({
                                   req,
                                   action,
                                   actorId,
                                   entityId,
                                   entityType = 'User',
                                   lockerId,
                                   details,
                               }: AuditParams): Promise<void> => {
    try {
        const sanitizedDetails = sanitizeAuditDetails({
            ipAddress: req.ip,
            userAgent: req.get('user-agent') ?? 'unknown',
            correlationId: req.headers['x-correlation-id'],
            ...details,
        }) as Prisma.InputJsonValue;

        await prismaService.auditLog.create({
            data: {
                actorId,
                lockerId,
                action,
                entityType,
                entityId,
                details: sanitizedDetails,
            },
        });
    } catch (err) {
        auditLogger.error('Failed to write audit log', { action, actorId, err });
    }
};
