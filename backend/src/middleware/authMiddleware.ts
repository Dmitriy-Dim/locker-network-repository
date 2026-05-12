import {NextFunction, Request, RequestHandler, Response} from "express";
import jwt from "jsonwebtoken";
import {Role} from "@prisma/client"

import {env} from "../config/env";
import {HttpError} from "../errorHandler/HttpError";
import {logger} from "../Logger/winston";
import { logSecurityEvent, SecurityEventType } from "../services/securityEventService";
import {prismaService} from "../services/prismaService";
import {TokenPayload} from "../utils/jwt";

export const protect: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {

    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        void logSecurityEvent({
            req,
            eventType: SecurityEventType.AUTH_MISSING_TOKEN,
            reason: "Missing bearer token in Authorization header",
        });
        return next(new HttpError(401, 'You are not logged in'));
    }
    let decoded: TokenPayload;

    try {
        decoded = jwt.verify(token, env.JWT_ACCESS_SECRET!) as TokenPayload;
    } catch (e) {
        (req.log || logger).warn("Invalid auth token");
        void logSecurityEvent({
            req,
            eventType: SecurityEventType.AUTH_INVALID_TOKEN,
            reason: e instanceof Error ? e.message : "Invalid access token",
        });
        return next(new HttpError(401, 'Invalid token'));
    }

    try {
        const registeredUser = await prismaService.user.findUnique({
            where: { userId: decoded.userId },
            select: {
                userId: true,
                role: true,
            },
        });

        if (!registeredUser) {
            void logSecurityEvent({
                req,
                actorId: decoded.userId,
                eventType: SecurityEventType.AUTH_USER_NOT_REGISTERED,
                reason: "Access token subject does not match a registered user",
                details: {
                    sessionId: decoded.sessionId,
                    tokenRole: decoded.role,
                },
            });
            return next(new HttpError(401, "Invalid token"));
        }

        const currentUser = {
            userId: registeredUser.userId,
            role: registeredUser.role,
            sessionId: decoded.sessionId,
        }

        req.user = currentUser;
        next();
    } catch (e) {
        next(e);
    }
};

export const authorize = (...roles: Role[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            void logSecurityEvent({
                req,
                eventType: SecurityEventType.AUTH_MISSING_TOKEN,
                reason: "Authorization attempted without authenticated user context",
                details: { requiredRoles: roles },
            });
            return next(new HttpError(401, 'Not authenticated'));
        }

        if (!roles.includes(req.user.role)) {
            void logSecurityEvent({
                req,
                actorId: req.user.userId,
                eventType: SecurityEventType.AUTH_FORBIDDEN,
                reason: "Authenticated user does not have required role",
                details: {
                    requiredRoles: roles,
                    actualRole: req.user.role,
                },
            });
            return next(new HttpError(403, 'Access denied'));
        }

        next();
    };
};
