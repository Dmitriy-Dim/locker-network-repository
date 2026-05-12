import { NextFunction, Request, Response } from "express";

import { bookingService } from "../services/BookingService";

export const extendBooking = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await bookingService.extendBooking(req, res);
    } catch (e) {
        next(e);
    }
};

export const getAllBookings = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await bookingService.getAllBookings(req, res);
    } catch (e) {
        next(e);
    }
};

export const initBooking = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await bookingService.initBooking(req, res);
    } catch (e) {
        next(e);
    }
};

export const getBooking = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await bookingService.getBooking(req, res);
    } catch (e) {
        next(e);
    }
};

export const getAllBookingsAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await bookingService.getAllBookingsAdmin(req, res);
    } catch (e) {
        next(e);
    }
};

export const getBookingAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await bookingService.getBookingAdmin(req, res);
    } catch (e) {
        next(e);
    }
};

export const updateBookingStatusAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await bookingService.updateBookingStatusAdmin(req, res);
    } catch (e) {
        next(e);
    }
};

export const cancelBooking = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await bookingService.cancelBooking(req, res);
    } catch (e) {
        next(e);
    }
};

export const endBooking = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return await bookingService.endBooking(req, res);
    } catch (e) {
        next(e);
    }
};
