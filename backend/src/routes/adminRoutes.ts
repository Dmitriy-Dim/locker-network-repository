import express from "express";
import {Role} from "@prisma/client";

import * as auth from "../middleware/authMiddleware";
import * as adminActionsController from "../controllers/adminActionsController";
import * as paymentController from "../controllers/paymentController";
import {authorize} from "../middleware/authMiddleware";
import {validateRequest} from "../middleware/validateRequest";
import {adminUsersQuerySchema, userIdQuerySchema} from "../validation/userSchemas";

export const adminRoutes = express.Router();
export const adminPaymentsRoutes = express.Router();

// ---admin only routes---
// ----  Users  ----
adminRoutes.use(auth.protect)

//change user role
adminRoutes.patch('/:id',authorize(Role.ADMIN),adminActionsController.changeRole);

//get all users as JSON
adminRoutes.get('/',authorize(Role.ADMIN),validateRequest(adminUsersQuerySchema),adminActionsController.getAllUsers);

// Get, delete, restore one User
adminRoutes.get('/:id',authorize(Role.ADMIN), validateRequest(userIdQuerySchema),adminActionsController.getUserById);
adminRoutes.delete('/:id',authorize(Role.ADMIN),validateRequest(userIdQuerySchema), adminActionsController.deleteUser);
adminRoutes.patch('/:id/restore',authorize(Role.ADMIN),validateRequest(userIdQuerySchema), adminActionsController.restoreUser);

// ----  Payments  -----

adminPaymentsRoutes.use(auth.protect);
adminPaymentsRoutes.get('/',authorize(Role.ADMIN),paymentController.getAllPayments);
adminPaymentsRoutes.get('/:id',authorize(Role.ADMIN),paymentController.getOnePayment);
