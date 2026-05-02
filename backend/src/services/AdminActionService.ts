import { Request, Response } from "express";
import { Role } from "@prisma/client";

import { prismaService } from "./prismaService";
import { HttpError } from "../errorHandler/HttpError";
import {logAudit} from "../utils/audit";
import {ActionType} from "./dto/operationDto";

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

        const { role } = req.body as { role: Role };

        try {
            const user = await prismaService.user.findUnique({
                where: { userId: targetUserId },
                select: {
                    userId: true,
                    role: true,
                },
            });

            if (!user) {
                throw new HttpError(404, "User not found");
            }

            const updatedUser = await prismaService.user.update({
                where: { userId: targetUserId },
                data: { role },
                select: {
                    userId: true,
                    role: true,
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
        const users = await prismaService.user.findMany({
            where: {
                isDeleted: false,
            },
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
        });

        return res.status(200).json(users);
    }
}
