import { NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import type { RequestWithId } from '../common/middleware/request-id.middleware';
import { AuditLogsService } from './audit-logs.service';
type AuditRequest = RequestWithId & Request & {
    user?: {
        userId?: string;
        sub?: string;
        role?: string;
    };
};
export declare class AuditLogsMiddleware implements NestMiddleware {
    private readonly auditLogs;
    constructor(auditLogs: AuditLogsService);
    use(req: AuditRequest, res: Response, next: NextFunction): void;
}
export {};
