import {Request, Response} from "express";
import {Prisma, Role} from "@prisma/client";

import {HttpError} from "../errorHandler/HttpError";
import {logAudit} from "../utils/audit";

import {prismaService} from "./prismaService";
import {ActionType} from "./dto/operationDto";
import {logSecurityEvent, SecurityEventType} from "./securityEventService";
import {idempotencyService} from "./IdempotencyService";

export class AdminActions {

    //-------------change role

    static async changeRole(req: Request, res: Response) {
        const rawTargetUserId = req.params.id;
        const targetUserId = Array.isArray(rawTargetUserId)
            ? rawTargetUserId[0]
            : rawTargetUserId;

        if (!targetUserId) {
            throw new HttpError(400, "User id is required");
        }

        const {role} = req.body as { role: Role };

        try {
            const user = await prismaService.user.findUnique({
                where: {userId: targetUserId},
                select: {
                    userId: true,
                    role: true,
                },
            });

            if (!user) {
                throw new HttpError(404, "User not found");
            }

            const updatedUser = await prismaService.user.update({
                where: {userId: targetUserId},
                data: {role},
                select: {
                    userId: true,
                    role: true,
                },
            });

            void logSecurityEvent({
                req,
                actorId: req.user?.userId,
                eventType: SecurityEventType.ADMIN_ROLE_CHANGE,
                reason: "Privileged user role was changed",
                details: {
                    targetUserId: updatedUser.userId,
                    oldRole: user.role,
                    newRole: updatedUser.role,
                },
            });

            await logAudit({
                req,
                action: ActionType.USER_ROLE_UPDATE,
                actorId: req.user?.userId,
                entityId: updatedUser.userId,
                entityType: "User",
                details: {
                    old: {
                        role: user.role,
                    },
                    new: {
                        role: updatedUser.role,
                    },
                },
            });

            return res.status(200).json({
                id: updatedUser.userId,
                role: updatedUser.role,
            });
        } catch (e) {
            void logSecurityEvent({
                req,
                actorId: req.user?.userId,
                eventType: SecurityEventType.ADMIN_ROLE_CHANGE_FAILED,
                reason: "Privileged user role change failed",
                details: {
                    targetUserId,
                    requestedRole: role,
                    error: e instanceof Error ? e.message : "Unknown error",
                },
            });

            await logAudit({
                req,
                action: ActionType.USER_ROLE_UPDATE_FAILED,
                actorId: req.user?.userId,
                entityId: targetUserId,
                entityType: "User",
                details: {
                    reason: e instanceof Error ? e.message : "Unknown error",
                },
            });

            if (e instanceof HttpError) {
                throw e;
            }

            throw new HttpError(500, "Failed to update user role");
        }
    }

    //--------------------getAllUsers

    static async getAllUsers(req: Request, res: Response) {
        const limit = req.query.limit === undefined ? undefined : Number(req.query.limit);
        const skip = Number(req.query.skip ?? 0);
        const role = req.query.role as Role | undefined;
        const email = req.query.email as string | undefined;
        const phone = req.query.phone as string | undefined;
        const name = req.query.name as string | undefined;
        const includeDeleted = String(req.query.includeDeleted) === "true" || String(req.query.includeDeleted) === "1";

        const where: Prisma.UserWhereInput = {
            ...(includeDeleted ? {} : {isDeleted: false}),
            ...(role && {role}),
            ...(email && {email: {contains: email, mode: "insensitive"}}),
            ...(phone && {phone: {contains: phone}}),
            ...(name && {name: {contains: name, mode: "insensitive"}}),
        };

        const users = await prismaService.user.findMany({
            where,
            select: {
                userId: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: {
                createdAt: "desc",
            },
            skip,
            ...(limit !== undefined && {take: limit}),
        });

        const total = await prismaService.user.count({where});

        res.setHeader("x-total-count", total);
        res.setHeader("x-skip", skip);
        if (limit !== undefined) {
            res.setHeader("x-limit", limit);
        }

        return res.status(200).json(users);
    }


    static async getUserById(req: Request, res: Response) {
        const userId = req.params.id as string;
        const user = await prismaService.user.findUnique({
            where: {userId},
            select: {
                userId: true,
                name: true,
                phone: true,
                email: true,
                role: true,
            }
        })
        if (!user) {
            throw new HttpError(404, "User not found");
        }
        return res.status(200).json(user);
    }

    static async deleteUser(req: Request, res: Response) {
        return idempotencyService.execute(
            req,
            res,
            "user:delete",
            {userId: req.params.id},
            async () => {
                const userId = req.params.id as string;
                try {
                    const result = await prismaService.$transaction(async (tx) => {
                        const user = await tx.user.findUnique({
                            where: {userId}
                        })
                        if (!user) {
                            throw new HttpError(404, "User not found");
                        }
                        if (user.isDeleted === true) {
                            throw new HttpError(400, "User already deleted");
                        }
                        const deletedUser = await tx.user.update({
                            where: {userId},
                            data: {
                                isDeleted: true,
                                deletedAt: new Date().toISOString()
                            },
                            select: {
                                userId: true,
                                name: true,
                                phone: true,
                                email: true,
                                role: true,
                            }
                        });
                        return deletedUser;
                    });
                    await logAudit({
                        req,
                        action: ActionType.USER_DELETE,
                        actorId: req.user?.userId,
                        entityId: userId,
                        entityType: "User",
                    });

                    return {
                        statusCode: 200,
                        body: {
                            result
                        }
                    }

                } catch (e) {
                    await logAudit({
                        req,
                        action: ActionType.USER_DELETE_FAILED,
                        actorId: req.user?.userId,
                        entityId: userId,
                        entityType: "User",
                        details: {
                            reason: e instanceof Error ? e.message : "Unknown error",
                        },
                    });

                    if (e instanceof HttpError) {
                        throw e;
                    }

                    throw new HttpError(500, "Failed to delete user");
                }
            }
        );
    }

    static async restoreUser(req: Request, res: Response) {
        return idempotencyService.execute(
            req,
            res,
            "user:restore",
            {userId: req.params.id},
            async () => {
                const userId = req.params.id as string;
                try {
                    const result = await prismaService.$transaction(async (tx) => {
                        const user = await tx.user.findUnique({
                            where: {userId}
                        })
                        if (!user) {
                            throw new HttpError(404, "User not found");
                        }
                        if (user.isDeleted === false) {
                            throw new HttpError(400, "User already active");
                        }
                        const restoredUser = await tx.user.update({
                            where: {userId},
                            data: {
                                isDeleted: false,
                                deletedAt: null
                            },
                            select: {
                                userId: true,
                                name: true,
                                phone: true,
                                email: true,
                                role: true,
                            }
                        });
                        return restoredUser;
                    });
                    await logAudit({
                        req,
                        action: ActionType.USER_RESTORE,
                        actorId: req.user?.userId,
                        entityId: userId,
                        entityType: "User",
                    });

                    return {
                        statusCode: 200,
                        body: {
                            result
                        }
                    }

                } catch (e) {
                    await logAudit({
                        req,
                        action: ActionType.USER_RESTORE_FAILED,
                        actorId: req.user?.userId,
                        entityId: userId,
                        entityType: "User",
                        details: {
                            reason: e instanceof Error ? e.message : "Unknown error",
                        },
                    });

                    if (e instanceof HttpError) {
                        throw e;
                    }

                    throw new HttpError(500, "Failed to restore user");
                }
            }
        );
    }
}
