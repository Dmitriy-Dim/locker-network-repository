import { Request } from 'express';

import { prismaService } from '../services/prismaService';
import {auditLogger} from '../Logger/winston';

type AuditAction =
    | 'USER_LOGIN'
    | 'USER_LOGIN_FAILED'
    | 'USER_LOGOUT'
    | 'USER_REGISTER'
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
    | 'BOOKING_UPDATE_STATUS'
    | 'BOOKING_UPDATE_STATUS_FAILED'
    | "CITY_CREATE"
    | 'CITY_CREATE_FAILED'
    | 'CITY_DELETE'
    | 'CITY_DELETE_FAILED'
    | 'PRICE_CREATE'
    | 'PRICE_CREATE_FAILED'
    | 'PRICE_UPDATE'
    | 'PRICE_UPDATE_FAILED';

interface AuditParams {
    req: Request;
    action: AuditAction;
    actorId?: string;
    entityId: string;
    entityType?: string;
    lockerId?: string;
    details?: Record<string, unknown>;
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
        await prismaService.auditLog.create({
            data: {
                actorId,
                lockerId,
                action,
                entityType,
                entityId,
                details: {
                    ipAddress: req.ip,
                    userAgent: req.get('user-agent') ?? 'unknown',
                    correlationId: req.headers['x-correlation-id'],
                    ...details,
                },
            },
        });
    } catch (err) {
        auditLogger.error('Failed to write audit log', { action, actorId, err });
    }
};
