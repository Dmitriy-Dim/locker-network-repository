import express from "express";
import { Role } from "@prisma/client";

import * as bookingController from "../controllers/bookingController";
import { authorize, protect } from "../middleware/authMiddleware";
import { validateRequest } from "../middleware/validateRequest";
import {
    adminBookingsQuerySchema,
    bookingInitSchema,
    bookingStatusChangeSchema,
    extendBookingSchema,
    myBookingsQuerySchema,
    oneBookingSchema
} from "../validation/bookingSchemas";

export const bookingsRoutes = express.Router();

bookingsRoutes.use(protect);
bookingsRoutes.post("/init", authorize(Role.USER), validateRequest(bookingInitSchema), bookingController.initBooking);
bookingsRoutes.get("/admin", authorize(Role.ADMIN), validateRequest(adminBookingsQuerySchema), bookingController.getAllBookingsAdmin);
bookingsRoutes.post("/admin/reconcile-dynamo-rds", authorize(Role.ADMIN), bookingController.reconcileDynamoBookingsToRds);
bookingsRoutes.get("/admin/:id", authorize(Role.ADMIN), validateRequest(oneBookingSchema), bookingController.getBookingAdmin);
bookingsRoutes.patch("/admin/:id/status", authorize(Role.ADMIN), validateRequest(bookingStatusChangeSchema), bookingController.updateBookingStatusAdmin);
bookingsRoutes.get("/my", authorize(Role.USER), validateRequest(myBookingsQuerySchema), bookingController.getAllBookings);
bookingsRoutes.post("/:id/cancel", authorize(Role.USER, Role.ADMIN), validateRequest(oneBookingSchema), bookingController.cancelBooking);
bookingsRoutes.post("/:id/end", authorize(Role.USER, Role.ADMIN), validateRequest(oneBookingSchema), bookingController.endBooking);
bookingsRoutes.get("/:id", authorize(Role.USER, Role.OPERATOR, Role.ADMIN), validateRequest(oneBookingSchema), bookingController.getBooking);
bookingsRoutes.post("/:id/extend", authorize(Role.USER), validateRequest(extendBookingSchema), bookingController.extendBooking);
