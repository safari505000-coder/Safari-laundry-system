import type { NextFunction, Request, Response } from 'express';
export type RequestWithId = Request & {
    requestId?: string;
};
export declare function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction): void;
