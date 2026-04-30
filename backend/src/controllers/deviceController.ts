import { NextFunction, Request, Response } from "express";

import {deviceService} from "../services/DeviceService";



export const openDeviceUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await deviceService.openDeviceUser(req, res);
    } catch (e) {
        next(e);
    }
};

export const closeDeviceUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await deviceService.closeDeviceUser(req, res);
    } catch (e) {
        next(e);
    }
};

export const openDeviceOper = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await deviceService.openDeviceOper(req, res);
    } catch (e) {
        next(e);
    }
};

export const closeDeviceOper = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await deviceService.closeDeviceOper(req, res);
    } catch (e) {
        next(e);
    }
};

