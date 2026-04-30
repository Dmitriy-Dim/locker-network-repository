import express from "express";
import {Role} from "@prisma/client";

import * as deviceController from "../controllers/deviceController";
import * as auth from "../middleware/authMiddleware";
import {authorize} from "../middleware/authMiddleware";
import {validateRequest} from "../middleware/validateRequest";
import {userDeviceOpenCloseSchema} from "../validation/devicesSchema";


export const devicesRoutes = express.Router();


devicesRoutes.use(auth.protect)
// User actions
devicesRoutes.post('/open-locker', authorize(Role.USER), validateRequest(userDeviceOpenCloseSchema), deviceController.openDeviceUser);
devicesRoutes.post('/close-locker', authorize(Role.USER), validateRequest(userDeviceOpenCloseSchema), deviceController.closeDeviceUser);

// Operator actions
devicesRoutes.post('/oper/open-locker', authorize(Role.OPERATOR), deviceController.openDeviceOper);
devicesRoutes.post('/oper/close-locker', authorize(Role.OPERATOR), deviceController.closeDeviceOper);
