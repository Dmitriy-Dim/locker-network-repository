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

export const openDeviceOperByStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await deviceService.openDeviceOperByStatus(req, res);
    } catch (e) {
        next(e);
    }
};

export const openAllDevicesOper = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await deviceService.openAllDevicesOper(req, res);
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

export const closeDeviceOperByStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await deviceService.closeDeviceOperByStatus(req, res);
    } catch (e) {
        next(e);
    }
};

export const closeAllDevicesOper = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await deviceService.closeAllDevicesOper(req, res);
    } catch (e) {
        next(e);
    }
};
