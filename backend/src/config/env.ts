import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const optionalUrl = z.string().url().optional().or(
    z.literal("").transform(() => undefined)
);

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().default(3555),
    DATABASE_URL: z.string().min(1, "DATABASE is required"),

    JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET is required"),
    JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET is required"),
    JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
    JWT_ACCESS_TOKEN_TTL: z.coerce.number().default(15),
    JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
    JWT_REFRESH_TOKEN_TTL: z.coerce.number().default(7),
    GOOGLE_CLIENT_ID: z.string().optional(),

    FRONTEND_URL: optionalUrl,
    FRONTEND_LOCAL_URL: optionalUrl,
    SERVER_URL: optionalUrl,
    SQS_URL: optionalUrl,
    OPERATIONS_QUEUE_URL: optionalUrl,
    CACHE_PROJECTION_QUEUE_URL: optionalUrl,
    CLOUDFRONT_URL: optionalUrl,
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),
    AWS_REGION: z.string().default("eu-west-1"),
    AWS_PROFILE: z.string().optional(),
    AWS_ENDPOINT_URL: optionalUrl,
    AWS_ROLE_ARN: z.string().optional(),
    AWS_ROLE_SESSION_NAME: z.string().optional(),
    DYNAMO_ROLE_ARN: z.string().optional(),
    DYNAMO_ROLE_SESSION_NAME: z.string().optional(),
    DYNAMO_TABLE_NAME: z.string().optional(),
    DYNAMO_BOOKINGS_TABLE_NAME: z.string().optional(),
    DYNAMO_LOCKER_CACHE_TABLE_NAME: z.string().optional(),
    DYNAMODB_ENDPOINT_URL: optionalUrl,
    REDIS_URL: optionalUrl,
    REDIS_STATION_CACHE_PREFIX: z.string().default("station-cache:"),
    REDIS_STATION_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    REDIS_CITY_CACHE_PREFIX: z.string().default("city-cache:"),
    REDIS_CITY_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    SQS_ROLE_ARN: z.string().optional(),
    SQS_ROLE_SESSION_NAME: z.string().optional(),
    SQS_ENDPOINT_URL: optionalUrl,
    LOG_LEVEL: z.string().default("info"),
    CLOUDWATCH_LOG_GROUP_NAMES: z.string().optional(),
    CLOUDWATCH_LOGS_ROLE_ARN: z.string().optional(),
    CLOUDWATCH_LOGS_ROLE_SESSION_NAME: z.string().optional(),
    CLOUDWATCH_LOGS_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
    USE_LAMBDA_HEALTH: z.string().default("false"),
    LAMBDA_HEALTH_URL: optionalUrl,
    BOOKING_EXPIRATION_DISABLED: z.string().default("false"),
    BOOKING_EXPIRATION_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
    BOOKING_EXPIRATION_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(100),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    const formatted = parsed.error.flatten().fieldErrors;
    throw new Error(
        `Environment validation failed: ${JSON.stringify(formatted)}`
    );
}

export const env = parsed.data;
