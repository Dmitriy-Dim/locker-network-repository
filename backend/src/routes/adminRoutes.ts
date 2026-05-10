import {authorize} from "../middleware/authMiddleware";
import {Role} from "@prisma/client";
import * as adminActionsController from "../controllers/adminActionsController";
import * as auth from "../middleware/authMiddleware";
import express from "express";
import {validateRequest} from "../middleware/validateRequest";
import {adminUsersQuerySchema} from "../validation/userSchemas";

export const adminRoutes = express.Router();

// ---admin only routes---

//change user role
adminRoutes.patch('/:id',auth.protect,authorize(Role.ADMIN),adminActionsController.changeRole);

//get all users as JSON
adminRoutes.get('/',auth.protect,authorize(Role.ADMIN),validateRequest(adminUsersQuerySchema),adminActionsController.getAllUsers);


