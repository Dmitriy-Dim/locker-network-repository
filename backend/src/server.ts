
import {randomUUID} from 'crypto';

import cookieParser from "cookie-parser";
import cors from "cors";
import express, {Application, NextFunction, Request, Response} from 'express'
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import hpp from 'hpp';
import qs from 'qs';
import swaggerUi from "swagger-ui-express"

import {env} from "./config/env";
import {errorHandler} from "./errorHandler/errorHandler";
import {logger} from "./Logger/winston";
import {authRouter} from "./routes/authRoutes";
import { bookingsRoutes } from "./routes/bookingsRoutes";
import {healthRouter} from "./routes/healthRoutes";
import {HttpError} from './errorHandler/HttpError';
import {lockersRoutes} from "./routes/lockersRoutes";
import {operationsRouter} from "./routes/operationsRoutes";
import { paymentsRoutes } from "./routes/paymentsRoutes";
import { logSecurityEvent, SecurityEventType } from "./services/securityEventService";
import { sendError } from "./utils/response";
import { citiesRoutes } from './routes/citiesRoutes';
import {adminPaymentsRoutes, adminRoutes} from "./routes/adminRoutes";
import {pricingRoutes} from "./routes/pricingRoutes";
import {devicesRoutes} from "./routes/deviceRoutes";
import {securityAlertRoutes} from "./routes/securityAlertRoutes";
import {auditLogRoutes} from "./routes/auditLogRoutes";
import {getRequestIpAddress} from "./utils/securityAlert";

const PORT = env.PORT;
const baseUrl = env.SERVER_URL || `http://localhost:${PORT}`;

export const createApp = () => {


    const app: Application = express();
    app.set('trust proxy', 1);

    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                connectSrc: ["'self'", env.FRONTEND_URL].filter(Boolean) as string[],
                formAction: ["'self'"],
                frameAncestors: ["'none'"],
                objectSrc: ["'none'"],
            }
        },
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        }
    }));

    app.use(cookieParser());

    //==============Correlation ID==========
    app.use((req: Request, res: Response, next: NextFunction) => {
        const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
        req.headers['x-correlation-id'] = correlationId;
        req.correlationId = correlationId;
        req.log = logger.child({ correlationId });
        res.setHeader('x-correlation-id', correlationId);
        next();
    });

    //===============Logging============

    app.use((req: Request, res: Response, next: NextFunction) => {
        const startedAt = process.hrtime.bigint();

        res.on("finish", () => {
            const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

            if (req.path === "/health" && res.statusCode < 500) {
                return;
            }

            logger.info("HTTP_ACCESS", {
                category: "HTTP_ACCESS",
                correlationId: req.correlationId,
                method: req.method,
                path: req.path,
                statusCode: res.statusCode,
                durationMs: Math.round(durationMs),
                ipAddress: getRequestIpAddress(req),
                userAgent: req.get("user-agent") ?? "unknown",
                contentLength: res.getHeader("content-length"),
            });
        });

        next();
    });

    //===============Middleware============
    app.use("/api/v1/payments/webhook", express.raw({ type: "application/json", limit: "256kb" }));
    app.use(express.json({limit: '10kb'}));
    app.set('query parser', (str: string) => qs.parse(str));

    app.use(hpp())

    //===============CORS============
    app.use(
        cors({
            origin: [
                env.FRONTEND_LOCAL_URL,
                env.FRONTEND_URL,
                env.SERVER_URL,
                env.CLOUDFRONT_URL
            ].filter(Boolean) as string[],
            methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            allowedHeaders: [
                "Content-Type",
                "Authorization",
                "Accept",
                "Idempotency-Key",
                "X-Idempotency-Key",
                "X-Correlation-Id",
            ],
            exposedHeaders: ["x-correlation-id"],
            credentials: true
        })
    );

    //===============Limiter============
    const globalLimiter = rateLimit({
        skip: (req) => req.path.startsWith('/api/v1/auth'),
        max: 200,
        windowMs: 60 * 60 * 1000,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            void logSecurityEvent({
                req,
                eventType: SecurityEventType.RATE_LIMIT_EXCEEDED,
                reason: "Global API rate limit exceeded",
                actorId: req.user?.userId,
                details: {
                    limiterName: "global",
                    limit: req.rateLimit?.limit,
                    current: req.rateLimit?.used,
                    remaining: req.rateLimit?.remaining,
                    resetTime: req.rateLimit?.resetTime?.toISOString?.(),
                },
            });

            return sendError(res, 429, "RATE_LIMIT_EXCEEDED", "Too many requests from this IP, please try again in an hour!");
        },
    });

    app.use(globalLimiter);
    //==============Swagger Docs==========
    if (env.NODE_ENV !== 'production') {
        const swaggerDoc = require("../docs/openapi.json");
        app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
    }

    //===============Router================
    const API_PREFIX = '/api/v1';
    app.get('/', (_, res) => res.send('API is running'));
    app.use(`${API_PREFIX}/auth`, authRouter)
    app.use(`${API_PREFIX}/operations`, operationsRouter)
    app.use(`/operations`, operationsRouter)
    app.use(`/health`, healthRouter)
    app.use(`${API_PREFIX}/bookings`, bookingsRoutes)
    app.use(`${API_PREFIX}/payments`, paymentsRoutes)
    app.use(`${API_PREFIX}/lockers`, lockersRoutes)
    app.use(`${API_PREFIX}/cities`, citiesRoutes)
    app.use(`${API_PREFIX}/admin/users`, adminRoutes)
    app.use(`${API_PREFIX}/admin/security-alerts`, securityAlertRoutes)
    app.use(`${API_PREFIX}/admin/payments`, adminPaymentsRoutes);
    app.use(`${API_PREFIX}/operator/security-alerts`, securityAlertRoutes)
    app.use(`${API_PREFIX}/admin/audit-logs`, auditLogRoutes)
    app.use(`${API_PREFIX}/pricing`, pricingRoutes);
    app.use(`${API_PREFIX}/devices`, devicesRoutes);




    //===============404 Handler================
    app.use((req, res, next) => {
        next(new HttpError(404, `Cannot find ${req.originalUrl} on this server`));
    });

//=============Global Error Handler===========
    app.use(errorHandler)
    return app;
};

export const launchServer = async () => {
    const app = createApp();

    const server = app.listen(PORT, () => {
        logger.info(`App running at ${baseUrl}`);
    });

    return server;
};
