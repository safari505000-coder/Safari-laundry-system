import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditStatus } from '@prisma/client';
import type { Request } from 'express';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { RequestWithId } from '../../common/middleware/request-id.middleware';
import { IS_PUBLIC_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { AppPermission } from './permissions.enum';
import { permissionsForRole } from './roles-permissions.map';

type PermissionRequest = RequestWithId &
  Request & {
    user?: { userId?: string; sub?: string; role?: string };
  };

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogs: AuditLogsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<string>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<AppPermission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) {
      return true;
    }

    const req = context.switchToHttp().getRequest<PermissionRequest>();
    const role = req.user?.role;
    const granted = new Set(permissionsForRole(role));
    const ok = required.every((permission) => granted.has(permission));

    if (!ok) {
      this.auditLogs.auditDenied(
        req,
        'PERMISSION_DENIED',
        `missing_permissions:${required.join(',')}`,
      );
      throw new ForbiddenException('Missing required permission.');
    }

    this.auditFinancialAccess(req, required);
    return true;
  }

  private auditFinancialAccess(
    req: PermissionRequest,
    permissions: readonly AppPermission[],
  ): void {
    const shouldAudit = permissions.some((permission) =>
      [
        AppPermission.VIEW_INVOICES,
        AppPermission.AUDIT_INVOICE,
        AppPermission.VIEW_REPORTS,
        AppPermission.VIEW_FINANCIAL_REPORTS,
        AppPermission.VIEW_CASH,
        AppPermission.VIEW_DEBTS,
        AppPermission.VIEW_PAYROLL,
        AppPermission.APPROVE_EXPENSES,
      ].includes(permission),
    );
    if (!shouldAudit) {
      return;
    }
    this.auditLogs.log({
      userId: req.user?.userId ?? req.user?.sub ?? null,
      role: req.user?.role ?? null,
      action: 'PERMISSION_ACCESS',
      resource: 'financial_oversight',
      endpoint: req.originalUrl ?? req.url,
      method: req.method,
      status: AuditStatus.SUCCESS,
      ip: req.ip ?? null,
      userAgent:
        typeof req.headers['user-agent'] === 'string' ?
          req.headers['user-agent']
        : null,
      requestId: req.requestId ?? null,
      changes: { permissions },
    });
  }
}
