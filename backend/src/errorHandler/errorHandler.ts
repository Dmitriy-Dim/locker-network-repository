import {NextFunction, Request, Response} from "express";
import {ZodError} from "zod";

import {logger} from "../Logger/winston";
import {buildRequestAlertContext, emitSecurityAlert, getErrorDetails} from "../utils/securityAlert";
import {sendError} from "../utils/response";

import {HttpError} from "./HttpError";

function logInternalError(req: Request, err: Error) {
    (req.log || logger).error("Internal Server Error", err);
    emitSecurityAlert({
        ...buildRequestAlertContext(req),
        eventType: "INTERNAL_SERVER_ERROR",
        severity: "HIGH",
        reason: "Unhandled backend error",
        details: getErrorDetails(err),
    });
}

export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
        return sendError(res, 400, "VALIDATION_ERROR", "Validation failed", err.flatten().fieldErrors);
    }
    if (err instanceof HttpError) {
        if (err.status >= 500) {
            logInternalError(req, err);
            if (err.expose) {
                return sendError(res, err.status, err.code, err.message, err.details);
            }
            return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Internal Server Error");
        }

        return sendError(res, err.status, err.code, err.message, err.details);
    }

    logInternalError(req, err);

    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Internal Server Error");
};
