import express from "express";

import * as deviceController from "../controllers/deviceController";


export const devicesRoutes = express.Router();



// User actions
devicesRoutes.post('/open-locker', deviceController.openDeviceUser);
devicesRoutes.post('/close-locker',deviceController.closeDeviceUser);

// Operator actions
devicesRoutes.post('/oper/open-locker',deviceController.openDeviceOper);
devicesRoutes.post('/oper/open-locker/status',deviceController.openDeviceOperByStatus);
devicesRoutes.post('/oper/open-locker/all',deviceController.openAllDevicesOper);
devicesRoutes.post('/oper/close-locker',deviceController.closeDeviceOper);
devicesRoutes.post('/oper/close-locker/status',deviceController.closeDeviceOperByStatus);
devicesRoutes.post('/oper/close-locker/all',deviceController.closeAllDevicesOper);