import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from "express";
export type RequestContextStore = {
    traceId?: string;
    orderId?: string;
};
export declare const requestContext: AsyncLocalStorage<RequestContextStore>;
export declare function requestContextMiddleware(req: Request & {
    traceId?: string;
    requestId?: string;
}, _res: Response, next: NextFunction): void;
export declare function pickOrderIdFromRequest(req: {
    params?: Record<string, string | string[] | undefined>;
    body?: Record<string, unknown>;
    query?: Record<string, unknown>;
    path?: string;
}): string | undefined;
