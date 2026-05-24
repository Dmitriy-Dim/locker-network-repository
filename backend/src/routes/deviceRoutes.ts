import express from "express";
import {Role} from "@prisma/client";

import * as deviceController from "../controllers/deviceController";
import * as auth from "../middleware/authMiddleware";
import {authorize} from "../middleware/authMiddleware";
import {validateRequest} from "../middleware/validateRequest";
import {operDeviceOpenCloseSchema, userDeviceOpenCloseSchema} from "../validation/devicesSchema";
import { replaceLockerSchema } from "../validation/devicesSchema";


export const devicesRoutes = express.Router();


devicesRoutes.use(auth.protect)

// Replace locker

devicesRoutes.post("/replace-locker", authorize(Role.USER), validateRequest(replaceLockerSchema), deviceController.replaceLockerUser);

// User actions
devicesRoutes.post('/open-locker', authorize(Role.USER), validateRequest(userDeviceOpenCloseSchema), deviceController.openDeviceUser);
devicesRoutes.post('/close-locker', authorize(Role.USER), validateRequest(userDeviceOpenCloseSchema), deviceController.closeDeviceUser);

// Operator actions
devicesRoutes.post('/oper/open-locker', authorize(Role.OPERATOR),validateRequest(operDeviceOpenCloseSchema), deviceController.openDeviceOper);
devicesRoutes.post('/oper/close-locker', authorize(Role.OPERATOR), validateRequest(operDeviceOpenCloseSchema),deviceController.closeDeviceOper);
