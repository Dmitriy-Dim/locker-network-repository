import express from "express";
import { Role } from "@prisma/client";

import {createOperation, getOperationStatus, streamOperationStatus} from "../controllers/operationsController";
import { authorize, protect } from "../middleware/authMiddleware";


export const operationsRouter = express.Router();

operationsRouter.use(protect);
operationsRouter.use(authorize(Role.USER, Role.OPERATOR, Role.ADMIN));
operationsRouter.post('/health', createOperation);
operationsRouter.get('/:id/events', streamOperationStatus);
operationsRouter.get('/:id', getOperationStatus);
