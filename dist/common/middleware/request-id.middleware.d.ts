import type { NextFunction, Request, Response } from "express";
export type RequestWithId = Request & {
    requestId?: string;
};
export type RequestWithTrace = RequestWithId & {
    traceId?: string;
};
export declare function requestIdMiddleware(req: RequestWithTrace, res: Response, next: NextFunction): void;
