import express from "express";
import { Role } from "@prisma/client";

import { authorize, protect } from "../middleware/authMiddleware";
import * as auditLogController from "../controllers/auditLogController";

export const auditLogRoutes = express.Router();

auditLogRoutes.use(protect);
auditLogRoutes.use(authorize(Role.ADMIN));

auditLogRoutes.get("/", auditLogController.getAuditLogs);
