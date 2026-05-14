import { randomUUID } from "crypto";

import {Request, Response} from "express";
import {hash, verify} from "argon2";
import {OAuth2Client} from "google-auth-library";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";

import * as tokenService from "../utils/jwt"
import {getRefreshTokenExpiresAt, hashToken, timingSafeTokenCompare, TokenPayload} from "../utils/jwt"
import {env} from "../config/env";
import {HttpError} from "../errorHandler/HttpError";
import {logAudit} from '../utils/audit';

import {prismaService} from "./prismaService";
import {GoogleLoginDto, LoginDto, SignupDto} from "./dto/applDto";
import {ActionType} from "./dto/operationDto";
import { logSecurityEvent, SecurityEventType } from "./securityEventService";

const googleClient = new OAuth2Client();

function isPrismaUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function extractConstraintField(error: Prisma.PrismaClientKnownRequestError): string {
    const fields = error.meta?.target as string[] | undefined;
    return fields?.[0] ?? 'Field';
}

function isTokenExpiredError(error: unknown) {
    return error instanceof Error && error.name === "TokenExpiredError";
}

export class AuthServiceImplPostgres {
    private async auditLogoutFromExpiredRefreshToken(req: Request, refreshToken: string) {
        const decoded = jwt.decode(refreshToken) as Partial<TokenPayload> | null;
        const userId = decoded?.userId;
        const sessionId = decoded?.sessionId;

        if (!userId || !sessionId) {
            return;
        }

        await prismaService.refreshSession.updateMany({
            where: {
                id: sessionId,
                userId,
                revokedAt: null,
            },
            data: {
                revokedAt: new Date(),
            },
        });

        await logAudit({
            req,
            action: ActionType.USER_LOGOUT,
            actorId: userId,
            entityId: userId,
            details: {
                reason: "refresh_token_expired",
                sessionId,
            },
        });
    }

    async auth(res: Response, req: Request, user: { userId: string; role: TokenPayload['role'] }) {
        await prismaService.refreshSession.updateMany({
            where: {
                userId: user.userId,
                revokedAt: null,
            },
            data: {
                revokedAt: new Date(),
            },
        });

        const sessionId = await prismaService.refreshSession.create({
            data: {
                userId: user.userId,
                tokenHash: "",
                ipAddress: req.ip ?? null,
                deviceInfo: req.headers["user-agent"] ?? null,
                expiresAt: getRefreshTokenExpiresAt(),
            },
        });

        const payload: TokenPayload = { userId: user.userId, role: user.role, sessionId: sessionId.id };
        const { accessToken, refreshToken } =
            tokenService.generateTokens(payload);

        await prismaService.refreshSession.update({
            where: { id: sessionId.id },
            data: { tokenHash: hashToken(refreshToken) },
        });

        const expires = getRefreshTokenExpiresAt();
        tokenService.cookieToken(refreshToken, res, expires);

        return res.status(200).json({ accessToken });
    }

    async register(res: Response, req: Request, dto: SignupDto) {
        const {name, email, password, phone} = dto;
        let user;

        try {
            user = await prismaService.user.create({
                data: {
                    name,
                    email,
                    password: await hash(password),
                    phone,
                },
                select: {
                    userId: true,
                    role: true,
                    isDeleted: true,
                },
            });
        } catch (error) {
            if (isPrismaUniqueConstraintError(error)) {
                const field = extractConstraintField(error); // 'email' or 'phone'
                throw new HttpError(400, `${field} already in use`);
            }
            throw error;
        }
        await logAudit({
            req,
            action: ActionType.USER_REGISTER,
            actorId: user.userId,
            entityId: user.userId,
        });

        return this.auth(res, req, user);
    }

    async login(res: Response, req: Request, dto: LoginDto) {
        const {email, password} = dto;

        const user = await prismaService.user.findUnique({
            where: {
                email,
            },
            select: {
                userId: true,
                password: true,
                role: true,
                isDeleted: true,
            },
        });

        if (!user) {
            void logSecurityEvent({
                req,
                eventType: SecurityEventType.AUTH_USER_NOT_REGISTERED,
                reason: "Login failed: user not found",
                details: { email },
            });
            await logAudit({
                req,
                action: ActionType.USER_LOGIN_FAILED,
                entityId: email,
                entityType: 'User',
                details: { email, reason: 'User not found' },
            });
            throw new HttpError(401, 'Invalid credentials');
        }

        if (user.isDeleted) {
            void logSecurityEvent({
                req,
                actorId: user.userId,
                eventType: SecurityEventType.AUTH_INVALID_CREDENTIALS,
                reason: "Login failed: user is deleted",
                details: { email },
            });
            await logAudit({
                req,
                action: ActionType.USER_LOGIN_FAILED,
                actorId: user.userId,
                entityId: user.userId,
                details: { email, reason: 'User is deleted' },
            });
            throw new HttpError(401, 'Invalid credentials');
        }

        const isValidPassword = await verify(user.password, password);

        if (!isValidPassword) {
            void logSecurityEvent({
                req,
                actorId: user.userId,
                eventType: SecurityEventType.AUTH_INVALID_CREDENTIALS,
                reason: "Login failed: wrong password",
                details: { email },
            });
            await logAudit({
                req,
                action: ActionType.USER_LOGIN_FAILED,
                actorId: user.userId,
                entityId: user.userId,
                details: { email, reason: 'Wrong password' },
            });
            throw new HttpError(401, 'Invalid credentials');
        }

        await logAudit({
            req,
            action: ActionType.USER_LOGIN,
            actorId: user.userId,
            entityId: user.userId,
        });
        const {password: _, ...safeUser} = user;
        return this.auth(res, req, safeUser);
    }

    async googleLogin(res: Response, req: Request, dto: GoogleLoginDto) {
        if (!env.GOOGLE_CLIENT_ID) {
            throw new HttpError(500, "GOOGLE_CLIENT_ID is not configured");
        }

        let ticket;

        try {
            ticket = await googleClient.verifyIdToken({
                idToken: dto.idToken,
                audience: env.GOOGLE_CLIENT_ID,
            });
        } catch {
            void logSecurityEvent({
                req,
                eventType: SecurityEventType.AUTH_INVALID_CREDENTIALS,
                reason: "Google login failed: invalid id token",
            });
            throw new HttpError(401, "Invalid Google token");
        }

        const payload = ticket.getPayload();
        const email = payload?.email?.trim().toLowerCase();
        const name = payload?.name?.trim();

        if (!email || !payload?.email_verified) {
            void logSecurityEvent({
                req,
                eventType: SecurityEventType.AUTH_INVALID_CREDENTIALS,
                reason: "Google login failed: email is missing or not verified",
            });
            throw new HttpError(401, "Google account email is not verified");
        }

        let user = await prismaService.user.findUnique({
            where: { email },
            select: {
                userId: true,
                role: true,
                isDeleted: true,
            },
        });

        if (user?.isDeleted) {
            void logSecurityEvent({
                req,
                actorId: user.userId,
                eventType: SecurityEventType.AUTH_INVALID_CREDENTIALS,
                reason: "Google login failed: user is deleted",
                details: { email },
            });
            await logAudit({
                req,
                action: ActionType.USER_LOGIN_FAILED,
                actorId: user.userId,
                entityId: user.userId,
                details: { authProvider: "google", email, reason: "User is deleted" },
            });
            throw new HttpError(401, "Invalid Google token");
        }

        if (!user) {
            user = await prismaService.user.create({
                data: {
                    email,
                    name: name || email.split("@")[0] || "Google User",
                    password: await hash(randomUUID()),
                },
                select: {
                    userId: true,
                    role: true,
                    isDeleted: true,
                },
            });

            await logAudit({
                req,
                action: ActionType.USER_REGISTER,
                actorId: user.userId,
                entityId: user.userId,
                details: { authProvider: "google", email },
            });
        }

        await logAudit({
            req,
            action: ActionType.USER_LOGIN,
            actorId: user.userId,
            entityId: user.userId,
            details: { authProvider: "google", email },
        });

        return this.auth(res, req, user);
    }


    async logout(res: Response, req: Request, sessionId: string, userId: string) {
        await tokenService.refreshSession(sessionId, userId);
        tokenService.clearCookies(res);
        await logAudit({
            req,
            action: ActionType.USER_LOGOUT,
            actorId: userId,
            entityId: userId,
        });
        return res.status(200).json({ message: 'Logged out' });
    }

    async me(userId: string) {
        const currentUser = await prismaService.user.findUnique({
            where: {userId},
            select: {
                userId: true,
                email: true,
                phone: true,
                name: true,
                role: true,
                createdAt: true,
            },
        });

        if (!currentUser) {
            throw new HttpError(404, 'User not found');
        }

        return currentUser;
    }

    async refresh(res: Response, req: Request, refreshToken: string) {
        let payload: TokenPayload;

        try {
            payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, {
                algorithms: ['HS256'],
            }) as TokenPayload;
        } catch (error) {
            if (isTokenExpiredError(error)) {
                await this.auditLogoutFromExpiredRefreshToken(req, refreshToken);
            }

            tokenService.clearCookies(res);
            void logSecurityEvent({
                req,
                eventType: SecurityEventType.AUTH_REFRESH_FAILED,
                reason: isTokenExpiredError(error)
                    ? "Refresh failed: refresh token expired"
                    : "Refresh failed: invalid refresh token signature or format",
            });
            throw new HttpError(401, isTokenExpiredError(error) ? 'Token expired' : 'Invalid refresh token');
        }

        const session = await prismaService.refreshSession.findUnique({
            where: { id: payload.sessionId },
            include: { user: { select: { userId: true, role: true, isDeleted: true } } },
        });

        if (!session || session.userId !== payload.userId) {
            tokenService.clearCookies(res);
            void logSecurityEvent({
                req,
                actorId: payload.userId,
                eventType: SecurityEventType.AUTH_REFRESH_FAILED,
                reason: "Refresh failed: session not found",
                details: { sessionId: payload.sessionId },
            });
            throw new HttpError(401, 'Session not found');
        }

        if (session.user.isDeleted) {
            await prismaService.refreshSession.updateMany({
                where: { userId: session.userId, revokedAt: null },
                data: { revokedAt: new Date() },
            });

            tokenService.clearCookies(res);
            void logSecurityEvent({
                req,
                actorId: session.userId,
                eventType: SecurityEventType.AUTH_REFRESH_FAILED,
                reason: "Refresh failed: user is deleted",
                details: { sessionId: session.id },
            });
            throw new HttpError(401, "Invalid refresh token");
        }

        if (session.revokedAt) {
            await prismaService.refreshSession.updateMany({
                where: { userId: session.userId, revokedAt: null },
                data: { revokedAt: new Date() },
            });

            tokenService.clearCookies(res);
            void logSecurityEvent({
                req,
                actorId: session.userId,
                eventType: SecurityEventType.AUTH_REFRESH_FAILED,
                reason: "Refresh failed: token reuse detected",
                details: { sessionId: session.id },
            });
            throw new HttpError(401, "Token reuse detected");
        }

        if (session.expiresAt < new Date()) {
            await logAudit({
                req,
                action: ActionType.USER_LOGOUT,
                actorId: session.userId,
                entityId: session.userId,
                details: {
                    reason: "refresh_session_expired",
                    sessionId: session.id,
                },
            });
            tokenService.clearCookies(res);
            void logSecurityEvent({
                req,
                actorId: session.userId,
                eventType: SecurityEventType.AUTH_REFRESH_FAILED,
                reason: "Refresh failed: token expired",
                details: { sessionId: session.id },
            });
            throw new HttpError(401, "Token expired");
        }

        const incomingHash = hashToken(refreshToken);

        if (!timingSafeTokenCompare(incomingHash, session.tokenHash)) {
            tokenService.clearCookies(res);
            void logSecurityEvent({
                req,
                actorId: session.userId,
                eventType: SecurityEventType.AUTH_REFRESH_FAILED,
                reason: "Refresh failed: token hash mismatch",
                details: { sessionId: session.id },
            });
            throw new HttpError(401, "Invalid token");
        }

        const updated = await prismaService.refreshSession.updateMany({
            where: {
                id: session.id,
                revokedAt: null,
            },
            data: { revokedAt: new Date() },
        });

        if (updated.count === 0) {
            tokenService.clearCookies(res);
            void logSecurityEvent({
                req,
                actorId: session.userId,
                eventType: SecurityEventType.AUTH_REFRESH_FAILED,
                reason: "Refresh failed: token already used",
                details: { sessionId: session.id },
            });
            throw new HttpError(401, "Token already used");
        }

        await logAudit({
            req,
            action: ActionType.TOKEN_REFRESH,
            actorId: session.user.userId,
            entityId: session.id,
        });

        return this.auth(res, req, session.user);
    }
}

export const authService = new AuthServiceImplPostgres()
