import winston from 'winston';

import {env} from "../config/env";

const appTransports: winston.transport[] = [
    new winston.transports.Console(),
];

if (env.NODE_ENV !== "production") {
    appTransports.push(
        new winston.transports.File({ filename: 'logs/app.log' }),
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' })
    );
}

const auditTransports: winston.transport[] = [
    new winston.transports.Console(),
];

if (env.NODE_ENV !== "production") {
    auditTransports.push(new winston.transports.File({ filename: 'logs/audit.log' }));
}

export const logger = winston.createLogger({
    level: env.LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({stack: true}),
        winston.format.json()
    ),
    transports: appTransports,
});

export const auditLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    defaultMeta: { type: 'AUDIT' },
    transports: auditTransports,
});
