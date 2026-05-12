import { NextFunction, Request, Response } from "express";

import { AdminActions } from "../services/AdminActionService";

export const changeRole = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await AdminActions.changeRole(req, res);
    } catch (e) {
        next(e);
    }
};

export const getAllUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await AdminActions.getAllUsers(req, res);
    } catch (e) {
        next(e);
    }
};

export const getUserById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await AdminActions.getUserById(req, res);
    } catch (e) {
        next(e);
    }
};

export const deleteUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await AdminActions.deleteUser(req, res);
    } catch (e) {
        next(e);
    }
};

export const restoreUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await AdminActions.restoreUser(req, res);
    } catch (e) {
        next(e);
    }
};