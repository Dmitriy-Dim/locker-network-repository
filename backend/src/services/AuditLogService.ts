import { Request, Response } from "express";
import { Prisma } from "@prisma/client";

import { HttpError } from "../errorHandler/HttpError";
import { ActionType } from "./dto/operationDto";
import { logAudit, sanitizeAuditDetails } from "../utils/audit";
import { sendSuccess } from "../utils/response";

import { prismaService } from "./prismaService";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

function firstQueryValue(value: unknown) {
    if (Array.isArray(value)) {
        return value[0];
    }

    return value;
}

function parsePositiveInt(value: unknown, fallback: number, max: number) {
    const rawValue = firstQueryValue(value);
    const parsed = Number(rawValue);

    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return Math.min(Math.floor(parsed), max);
}

function parseNonNegativeInt(value: unknown, fallback: number) {
    const rawValue = firstQueryValue(value);
    const parsed = Number(rawValue);

    if (!Number.isFinite(parsed) || parsed < 0) {
        return fallback;
    }

    return Math.floor(parsed);
}

function parseStringFilter(value: unknown) {
    const rawValue = firstQueryValue(value);

    if (typeof rawValue !== "string") {
        return undefined;
    }

    const trimmed = rawValue.trim();

    return trimmed.length > 0 ? trimmed : undefined;
}

export function parseDate(value: unknown, fallback: Date, fieldName: string) {
    const rawValue = firstQueryValue(value);

    if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
        return fallback;
    }

    const parsed = new Date(rawValue);

    if (Number.isNaN(parsed.getTime())) {
        throw new HttpError(400, `Invalid ${fieldName} date: ${rawValue}`, "VALIDATION_ERROR");
    }

    return parsed;
}

export class AuditLogService {
    static async getAuditLogs(req: Request, res: Response) {
        const limit = parsePositiveInt(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
        const skip = parseNonNegativeInt(req.query.skip, 0);
        const from = parseDate(req.query.from, new Date(Date.now() - DEFAULT_LOOKBACK_MS), "from");
        const to = parseDate(req.query.to, new Date(), "to");

        if (from > to) {
            throw new HttpError(400, "from date must be before to date", "VALIDATION_ERROR");
        }

        const actorId = parseStringFilter(req.query.actorId);
        const lockerId = parseStringFilter(req.query.lockerId);
        const action = parseStringFilter(req.query.action);
        const entityType = parseStringFilter(req.query.entityType);
        const entityId = parseStringFilter(req.query.entityId);

        const where: Prisma.AuditLogWhereInput = {
            createdAt: {
                gte: from,
                lte: to,
            },
            ...(actorId && { actorId }),
            ...(lockerId && { lockerId }),
            ...(action && { action }),
            ...(entityType && { entityType }),
            ...(entityId && { entityId }),
        };

        const [auditLogs, total] = await prismaService.$transaction([
            prismaService.auditLog.findMany({
                where,
                orderBy: {
                    createdAt: "desc",
                },
                skip,
                take: limit,
                include: {
                    actor: {
                        select: {
                            userId: true,
                            name: true,
                            email: true,
                            role: true,
                        },
                    },
                },
            }),
            prismaService.auditLog.count({ where }),
        ]);

        await logAudit({
            req,
            action: ActionType.AUDIT_LOG_READ,
            actorId: req.user?.userId,
            entityId: "audit-logs",
            entityType: "AuditLog",
            details: {
                filters: {
                    actorId,
                    lockerId,
                    action,
                    entityType,
                    entityId,
                    from: from.toISOString(),
                    to: to.toISOString(),
                    limit,
                    skip,
                },
                resultCount: auditLogs.length,
            },
        });

        return sendSuccess(res, auditLogs.map((auditLog) => ({
            ...auditLog,
            details: auditLog.details === null ? null : sanitizeAuditDetails(auditLog.details),
        })), 200, {
            source: "rds",
            limit,
            skip,
            total,
            from: from.toISOString(),
            to: to.toISOString(),
        });
    }
}
