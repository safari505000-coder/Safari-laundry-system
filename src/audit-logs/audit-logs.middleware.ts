import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { RequestWithId } from '../common/middleware/request-id.middleware';
import { AuditLogsService } from './audit-logs.service';

type AuditRequest = RequestWithId &
  Request & {
    user?: { userId?: string; sub?: string; role?: string };
  };

/**
 * 🔒 BANK-GRADE SECURITY LAYER
 * All access attempts must be audited and protected.
 * Unauthorized behavior must be detected and alerted.
 * DO NOT MODIFY WITHOUT SECURITY REVIEW.
 */
@Injectable()
export class AuditLogsMiddleware implements NestMiddleware {
  constructor(private readonly auditLogs: AuditLogsService) {}

  use(req: AuditRequest, res: Response, next: NextFunction): void {
    res.on('finish', () => {
      this.auditLogs.logRequest(req, res.statusCode);
    });
    next();
  }
}
