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
  ROLES_KEY,
} from '../decorators/roles.decorator';
import { PermissionsService } from '../../permissions/permissions.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<SafariRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) {
      return true;
    }
    const req = context
      .switchToHttp()
      .getRequest<{ user?: { role: string }; method?: string }>();
    const role = req.user?.role;
    // Global OWNER bypass: full access across all guarded routes/endpoints.
    if (role === SafariRole.OWNER) {
      return true;
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
