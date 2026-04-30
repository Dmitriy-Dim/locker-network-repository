import {authorize} from "../middleware/authMiddleware";
import {Role} from "@prisma/client";
import * as adminActionsController from "../controllers/adminActionsController";
import * as auth from "../middleware/authMiddleware";
import express from "express";

export const adminRoutes = express.Router();

// ---admin only routes---

//change user role
adminRoutes.patch('/:id',auth.protect,authorize(Role.ADMIN),adminActionsController.changeRole);

//get all users as json
adminRoutes.get('/',auth.protect,authorize(Role.ADMIN),adminActionsController.getAllUsers);



