import {NextFunction, Request, Response} from "express";
import {ZodError} from "zod";

import {logger} from "../Logger/winston";
import {sendError} from "../utils/response";

import {HttpError} from "./HttpError";


export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
        return sendError(res, 400, "VALIDATION_ERROR", "Validation failed", err.flatten().fieldErrors);
    }
    if (err instanceof HttpError) {
        return sendError(res, err.status, err.code, err.message, err.details);
    }

    (req.log || logger).error("Internal Server Error", err);

    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Internal Server Error");
};
