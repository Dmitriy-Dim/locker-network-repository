import { NextFunction, Request, Response } from "express";

import { AuditLogService } from "../services/AuditLogService";

export const getAuditLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await AuditLogService.getAuditLogs(req, res);
    } catch (e) {
        next(e);
    }
};
