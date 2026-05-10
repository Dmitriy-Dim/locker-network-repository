import { NextFunction, Request, Response } from "express";

import { SecurityAlertService } from "../services/SecurityAlertService";

export const getStoredAlerts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await SecurityAlertService.getStoredAlerts(req, res);
    } catch (e) {
        next(e);
    }
};

export const queryCloudWatchAlerts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await SecurityAlertService.queryCloudWatchAlerts(req, res);
    } catch (e) {
        next(e);
    }
};
