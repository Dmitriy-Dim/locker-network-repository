import express from "express";
import { Role } from "@prisma/client";

import { authorize, protect } from "../middleware/authMiddleware";
import * as securityAlertController from "../controllers/securityAlertController";

export const securityAlertRoutes = express.Router();

securityAlertRoutes.use(protect);
securityAlertRoutes.use(authorize(Role.ADMIN));

securityAlertRoutes.get("/", securityAlertController.getStoredAlerts);
securityAlertRoutes.get("/cloudwatch", securityAlertController.queryCloudWatchAlerts);
