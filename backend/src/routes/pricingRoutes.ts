import express from "express";
import {Role} from "@prisma/client";

import * as  pricingController from "../controllers/pricingController";
import * as auth from "../middleware/authMiddleware";
import {authorize} from "../middleware/authMiddleware";
import {validateRequest} from "../middleware/validateRequest";
import {changePriceSchema, createPriceSchema, pricingQuerySchema} from "../validation/pricingSchema";


export const pricingRoutes = express.Router();


pricingRoutes.use(auth.protect);
pricingRoutes.get("/", authorize(Role.ADMIN), validateRequest(pricingQuerySchema),pricingController.getAllPrices);
pricingRoutes.post("/", authorize(Role.ADMIN), validateRequest(createPriceSchema),pricingController.createPrice);
pricingRoutes.patch("/:id", authorize(Role.ADMIN),validateRequest(changePriceSchema),pricingController.changePrice);
