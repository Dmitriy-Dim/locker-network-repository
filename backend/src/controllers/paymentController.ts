import { NextFunction, Request, Response } from "express";

import { paymentService } from "../services/PaymentService";

export const stripeWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await paymentService.handleStripeWebhook(req, res);
    } catch (error) {
        next(error);
    }
};

export const getAllPayments = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await paymentService.getAllPayments(req, res);
    } catch (error) {
        next(error);
    }
};

export const getOnePayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await paymentService.getOnePayment(req, res);
    } catch (error) {
        next(error);
    }
};
