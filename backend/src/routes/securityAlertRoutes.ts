import express from "express";
import {Role} from "@prisma/client";

import {authorize, protect} from "../middleware/authMiddleware";
import * as securityAlertController
    from "../controllers/securityAlertController";

export const securityAlertRoutes = express.Router();

securityAlertRoutes.use(protect);
securityAlertRoutes.use(authorize(Role.ADMIN, Role.OPERATOR));

securityAlertRoutes.get("/cloudwatch", securityAlertController.queryCloudWatchAlerts);
