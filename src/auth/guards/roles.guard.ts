import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SafariRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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
    if (!role || !required.includes(role as SafariRole)) {
      throw new ForbiddenException(
        'Your role is not permitted to access this resource.',
      );
    }
    return true;
  }
}
