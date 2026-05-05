import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { RequestWithId } from '../common/middleware/request-id.middleware';
import { AuditLogsService } from './audit-logs.service';

type SecurityRequest = RequestWithId &
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
export class AuditSecurityGuard implements CanActivate {
  constructor(private readonly auditLogs: AuditLogsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<SecurityRequest>();

    if (await this.auditLogs.checkBlocked(req)) {
      this.auditLogs.auditDenied(req, 'TEMPORARILY_BLOCKED', 'blocked_until_active');
      throw new ForbiddenException('temporarily blocked');
    }

    if (!(await this.auditLogs.checkSensitiveRateLimit(req))) {
      this.auditLogs.auditDenied(req, 'RATE_LIMIT_EXCEEDED', 'ip_rate_limit');
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    if (!(await this.auditLogs.checkFailedAttemptBudget(req))) {
      this.auditLogs.auditDenied(req, 'RATE_LIMIT_EXCEEDED', 'failed_attempt_budget');
      throw new HttpException(
        'Too many failed attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
