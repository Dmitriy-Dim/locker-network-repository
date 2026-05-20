import express from "express";
import {Role} from "@prisma/client";

import * as deviceController from "../controllers/deviceController";
import * as auth from "../middleware/authMiddleware";
import {authorize} from "../middleware/authMiddleware";
import {validateRequest} from "../middleware/validateRequest";
import {operDeviceOpenCloseSchema, userDeviceOpenCloseSchema} from "../validation/devicesSchema";


export const devicesRoutes = express.Router();


devicesRoutes.use(auth.protect)
// User actions
devicesRoutes.post('/open-locker', authorize(Role.USER), validateRequest(userDeviceOpenCloseSchema), deviceController.openDeviceUser);
devicesRoutes.post('/close-locker', authorize(Role.USER), validateRequest(userDeviceOpenCloseSchema), deviceController.closeDeviceUser);

// User locker replace
//devicesRoutes.post('/replace-locker');


// Operator actions
devicesRoutes.post('/oper/open-locker', authorize(Role.OPERATOR),validateRequest(operDeviceOpenCloseSchema), deviceController.openDeviceOper);
devicesRoutes.post('/oper/close-locker', authorize(Role.OPERATOR), validateRequest(operDeviceOpenCloseSchema),deviceController.closeDeviceOper);
