import {NextFunction, Request, Response} from "express";
import {ZodError, ZodTypeAny} from "zod";

import {HttpError} from "../errorHandler/HttpError";

type ParsedRequestParts = {
    body?: unknown;
    params?: Request["params"];
    query?: Request["query"];
    cookies?: Request["cookies"];
};

export const validateRequest =
    (schema: ZodTypeAny) =>
        (req: Request, res: Response, next: NextFunction) => {
            try {
                const parsed = schema.parse({
                    body: req.body,
                    params: req.params,
                    query: req.query,
                    cookies: req.cookies,
                }) as ParsedRequestParts;

                req.body = parsed.body ?? req.body;
                if (parsed.params !== undefined) {
                    Object.defineProperty(req, "params", {
                        value: parsed.params,
                        writable: true,
                        enumerable: true,
                        configurable: true,
                    });
                }
                if (parsed.query !== undefined) {
                    Object.defineProperty(req, "query", {
                        value: parsed.query,
                        writable: true,
                        enumerable: true,
                        configurable: true,
                    });
                }
                req.cookies = parsed.cookies ?? req.cookies;

                next();
            } catch (e) {
                if (e instanceof ZodError) {
                    const details = e.issues.map(issue => ({
                        field: issue.path.join('.'),
                        message: issue.message,
                    }));
                    return next(new HttpError(400, "Validation failed", "VALIDATION_ERROR", details));
                }
                next(e);
            }
        };
