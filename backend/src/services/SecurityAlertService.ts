import {
    GetQueryResultsCommand,
    ResultField,
    StartQueryCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { Request, Response } from "express";

import { env } from "../config/env";
import { HttpError } from "../errorHandler/HttpError";
import { sendSuccess } from "../utils/response";
import { cloudWatchLogsClient } from "../utils/cloudWatchLogsClient";

const MAX_CLOUDWATCH_LIMIT = 100;
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

function parsePositiveInt(value: unknown, fallback: number, max: number) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return Math.min(Math.floor(parsed), max);
}

function parseDate(value: unknown, fallback: Date) {
    if (typeof value !== "string" || value.trim().length === 0) {
        return fallback;
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
        throw new HttpError(400, `Invalid date: ${value}`, "VALIDATION_ERROR");
    }

    return parsed;
}

function getConfiguredLogGroups() {
    return env.CLOUDWATCH_LOG_GROUP_NAMES
        ?.split(",")
        .map((name) => name.trim())
        .filter(Boolean) ?? [];
}

function toCloudWatchRecord(fields: ResultField[]) {
    return Object.fromEntries(
        fields
            .filter((field) => field.field)
            .map((field) => [field.field as string, field.value])
    );
}

export class SecurityAlertService {
    static async getStoredAlerts(req: Request, res: Response) {
        return SecurityAlertService.queryCloudWatchAlerts(req, res);
    }

    static async queryCloudWatchAlerts(req: Request, res: Response) {
        const logGroupNames = getConfiguredLogGroups();

        if (logGroupNames.length === 0) {
            throw new HttpError(
                500,
                "CLOUDWATCH_LOG_GROUP_NAMES is not configured",
                "CLOUDWATCH_LOG_GROUPS_NOT_CONFIGURED"
            );
        }

        const limit = parsePositiveInt(req.query.limit, 50, MAX_CLOUDWATCH_LIMIT);
        const from = parseDate(req.query.from, new Date(Date.now() - DEFAULT_LOOKBACK_MS));
        const to = parseDate(req.query.to, new Date());
        const eventTypeFilter = typeof req.query.eventType === "string"
            ? `| filter eventType = "${req.query.eventType.replace(/"/g, '\\"')}"`
            : "";
        const severityFilter = typeof req.query.severity === "string"
            ? `| filter severity = "${req.query.severity.replace(/"/g, '\\"')}"`
            : "";
        const sourceFilter = typeof req.query.source === "string"
            ? `| filter source = "${req.query.source.replace(/"/g, '\\"')}"`
            : "";
        const actorIdFilter = typeof req.query.actorId === "string"
            ? `| filter actorId = "${req.query.actorId.replace(/"/g, '\\"')}"`
            : "";
        const correlationIdFilter = typeof req.query.correlationId === "string"
            ? `| filter correlationId = "${req.query.correlationId.replace(/"/g, '\\"')}"`
            : "";
        const operationIdFilter = typeof req.query.operationId === "string"
            ? `| filter operationId = "${req.query.operationId.replace(/"/g, '\\"')}"`
            : "";
        const queryString = [
            "fields @timestamp, @logGroup, @logStream, severity, eventType, source, environment, correlationId, operationId, actorId, reason, path, details",
            '| filter category = "SECURITY_ALERT"',
            eventTypeFilter,
            severityFilter,
            sourceFilter,
            actorIdFilter,
            correlationIdFilter,
            operationIdFilter,
            "| sort @timestamp desc",
            `| limit ${limit}`,
        ].filter(Boolean).join("\n");

        const startResult = await cloudWatchLogsClient.send(new StartQueryCommand({
            logGroupNames,
            startTime: Math.floor(from.getTime() / 1000),
            endTime: Math.floor(to.getTime() / 1000),
            queryString,
            limit,
        }));

        if (!startResult.queryId) {
            throw new HttpError(502, "CloudWatch Logs Insights did not return queryId", "CLOUDWATCH_QUERY_FAILED");
        }

        const deadline = Date.now() + env.CLOUDWATCH_LOGS_QUERY_TIMEOUT_MS;
        let status = "Running";
        let results: ResultField[][] = [];

        while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 500));

            const queryResult = await cloudWatchLogsClient.send(new GetQueryResultsCommand({
                queryId: startResult.queryId,
            }));

            status = queryResult.status ?? "Unknown";
            results = queryResult.results ?? [];

            if (["Complete", "Failed", "Cancelled", "Timeout"].includes(status)) {
                break;
            }
        }

        if (status !== "Complete") {
            throw new HttpError(504, `CloudWatch query did not complete: ${status}`, "CLOUDWATCH_QUERY_TIMEOUT");
        }

        return sendSuccess(res, results.map(toCloudWatchRecord), 200, {
            source: "cloudwatch_logs_insights",
            queryId: startResult.queryId,
            logGroupNames,
            limit,
            from: from.toISOString(),
            to: to.toISOString(),
        });
    }
}
