import { Server } from "http";

import { logger } from "./Logger/winston";
import { launchServer } from "./server";
import {env} from "./config/env";
import {bookingExpirationService} from "./services/BookingExpirationService";
import {prismaService} from "./services/prismaService";
import {assertAwsCredentialsConfigured} from "./utils/awsClient";
import {emitSecurityAlert, getErrorDetails} from "./utils/securityAlert";
import {assertSqsCredentialsConfigured} from "./utils/sqsClient";

let server: Server;
let isShuttingDown = false;

process.on('uncaughtException', async (err) => {
    logger.error('UNCAUGHT EXCEPTION! Shutting down...', err);
    emitSecurityAlert({
        eventType: "UNCAUGHT_EXCEPTION",
        severity: "CRITICAL",
        reason: "Backend process crashed from uncaught exception",
        details: getErrorDetails(err),
    });
    await shutdown('UNCAUGHT EXCEPTION');
});

logger.info('Starting server initialization...');

(async () => {
    try {
        await prismaService.connectDB();
        logger.info('PostgreSQL connected successfully');

        try {
            await assertAwsCredentialsConfigured();
            await assertSqsCredentialsConfigured();
        } catch (err) {
            emitSecurityAlert({
                eventType: "AWS_CREDENTIALS_FAILED",
                severity: "HIGH",
                reason: "Backend cannot resolve AWS credentials",
                details: getErrorDetails(err),
            });
            throw err;
        }
        logger.info('AWS credentials resolved successfully');

        server = await launchServer();
        if (env.NODE_ENV !== "test" && env.BOOKING_EXPIRATION_DISABLED !== "true") {
            bookingExpirationService.start();
            logger.info("Booking expiration job started");
        }
    } catch (err) {
        logger.error('Server initialization failed', err);
        emitSecurityAlert({
            eventType: "SERVER_STARTUP_FAILED",
            severity: "CRITICAL",
            reason: "Backend failed to start",
            details: getErrorDetails(err),
        });
        process.exit(1);
    }
})();

const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`${signal} received. Shutting down gracefully...`);

    try {
        if (server) {
            await new Promise<void>((resolve) => {
                server.close(() => {
                    logger.info('HTTP server closed');
                    resolve();
                });
            });
        }

        bookingExpirationService.stop();
        await prismaService.disconnectDB();
        logger.info('Database disconnected');

        process.exit(0);
    } catch (err) {
        logger.error('Error during shutdown:', err);
        process.exit(1);
    }
};

process.on('unhandledRejection', async (err: Error) => {
    logger.error('UNHANDLED REJECTION! Shutting down...', err);
    emitSecurityAlert({
        eventType: "UNHANDLED_REJECTION",
        severity: "CRITICAL",
        reason: "Backend process crashed from unhandled rejection",
        details: getErrorDetails(err),
    });
    await shutdown('UNHANDLED REJECTION');
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
