import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SafariRole } from '@prisma/client';
import { FINANCE_DAILY_POS_SALES_OWN } from '../capabilities';
import {
  DRIVER_FINANCE_DAILY_POS_KEY,
  IS_PUBLIC_KEY,
  ROLES_KEY,
} from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../permissions/permissions.decorator';
import { PermissionsService } from '../../permissions/permissions.service';

/**
 * حارس الأدوار — يتحقق من دور JWT مقابل @Roles المطلوبة ويمنح صلاحية OWNER دائماً.
 * Roles guard — checks the JWT role against @Roles metadata; OWNER always passes.
 * Routes with @Permissions bypass this guard; routes with neither @Roles nor @Public throw 403.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<string>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredPermissions?.length) {
      return true;
    }
    const required = this.reflector.getAllAndOverride<SafariRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) {
      throw new ForbiddenException(
        'RBAC policy missing: endpoint must declare @Roles or @Public.',
      );
    }
    const req = context
      .switchToHttp()
      .getRequest<{ user?: { role: string }; method?: string }>();
    const role = req.user?.role;
    // Global OWNER bypass: full access across all guarded routes/endpoints.
    if (role === SafariRole.OWNER) {
      return true;
    }
    // V19.25 — Second-eye (GENERAL_MANAGER) must not be blocked from the
    // unified money stream. If a deployed API bundle lags the source tree
    // (`@Roles` on GET /reports/unified-ledger-stream), GM still needs this
    // read-only audit. Scope is the single path string only.
    if (role === SafariRole.GENERAL_MANAGER) {
      const rawUrl =
        (req as { originalUrl?: string; url?: string; path?: string })
          .originalUrl ??
        (req as { url?: string }).url ??
        (req as { path?: string }).path ??
        '';
      if (rawUrl.includes('unified-ledger-stream')) {
        return true;
      }
    }
    const driverDailyPos = this.reflector.getAllAndOverride<boolean>(
      DRIVER_FINANCE_DAILY_POS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (
      driverDailyPos &&
      role === SafariRole.DRIVER &&
      (await this.permissionsService.roleHasCapability(
        role,
        FINANCE_DAILY_POS_SALES_OWN,
      ))
    ) {
      return true;
    }
    if (!role || !required.includes(role as SafariRole)) {
      throw new ForbiddenException(
        'Your role is not permitted to access this resource.',
      );
    }
    return true;
  }
}
