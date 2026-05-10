import {NextFunction, Request, Response} from "express";

import { operationCommandService, operationReadService } from "../services/OperationService";


export const createOperation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await operationCommandService.createHealthCheckOperation(req,res);
    } catch (e) {
        next(e);
    }
}

export const getOperationStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await operationReadService.getOperationStatus(req,res);
    } catch (e) {
        next(e);
    }
}

export const streamOperationStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await operationReadService.streamOperationStatus(req, res);
    } catch (e) {
        next(e);
    }
}
