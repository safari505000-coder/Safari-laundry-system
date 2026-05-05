import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SafariRole } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../decorators/roles.decorator';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * V19.30 — GENERAL_MANAGER is a read-only oversight role at the HTTP layer.
 * Blocks every non-read method so mutations cannot slip through controllers
 * that only use @Roles (without @Permissions) when product policy removes
 * write AppPermissions from the role map.
 */
@Injectable()
export class GeneralManagerReadOnlyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<string>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{
      method?: string;
      user?: { role?: string };
    }>();
    const role = req.user?.role;
    if (role !== SafariRole.GENERAL_MANAGER) {
      return true;
    }

    const method = (req.method ?? 'GET').toUpperCase();
    if (READ_METHODS.has(method)) {
      return true;
    }

    throw new ForbiddenException('GENERAL_MANAGER is read-only.');
  }
}
