import {NextFunction, Request, Response} from "express";

import {citiesService} from "../services/CitiesServiceImplPostgress";

export const getAllCities = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await citiesService.getAllCities(req,res);
    } catch (e) {
        next(e);
    }
};

export const createCities = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await citiesService.createCities(req,res);
    } catch (e) {
        next(e);
    }
}

export const deleteCities = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await citiesService.deleteCities(req,res);
    } catch (e) {
        next(e);
    }
}

export const updateCities = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await citiesService.updateCities(req,res);
    } catch (e) {
        next(e);
    }
}