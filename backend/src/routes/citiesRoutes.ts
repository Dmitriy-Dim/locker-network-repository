import express from "express";
import {Role} from "@prisma/client";

import * as citiesController from "../controllers/citiesController";
import * as auth from "../middleware/authMiddleware";
import {authorize} from "../middleware/authMiddleware";

export const citiesRoutes = express.Router();

citiesRoutes.get('/',citiesController.getAllCities);
citiesRoutes.post('/',auth.protect,authorize(Role.ADMIN),citiesController.createCities)
citiesRoutes.delete('/:id',auth.protect,authorize(Role.ADMIN),citiesController.deleteCities);
citiesRoutes.patch('/:id',auth.protect,authorize(Role.ADMIN),citiesController.updateCities);

citiesRoutes.get('/',auth.protect,authorize(Role.ADMIN),citiesController.getSoftDeletedCities); //get all inactive cities
citiesRoutes.patch('/:id',auth.protect,authorize(Role.ADMIN),citiesController.restoreSoftDeletedCities); //set city as active

citiesRoutes.use(auth.protect);
