import {Request, Response, NextFunction} from 'express';

import * as healthService from '../services/HealthService';
import {logAudit} from "../utils/audit";
import {ActionType} from "../services/dto/operationDto";

const healthProbeUserAgents = [
    "ELB-HealthChecker",
    "Wget",
    "curl",
    "kube-probe",
    "Docker-Healthcheck",
];

const isHealthProbe = (userAgent: string) => {
    return healthProbeUserAgents.some((probeUserAgent) => userAgent.includes(probeUserAgent));
};

export const healthStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userAgent = req.headers['user-agent'] || '';
        const isProbe = isHealthProbe(String(userAgent));
        const result = await healthService.getHealthStatus({
            preferLocal: isProbe,
        });

        if (!isProbe) {
            void logAudit({
                req,
                action: ActionType.HEALTH_CHECK,
                actorId: undefined,
                entityId: "system",
                entityType: 'system'
            });
        }

        return res.status(result.status === 'ok' ? 200 : 503).json(result);
    } catch (e) {
        next(e);
    }
}
