import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/roles.decorator';

function normalizedPath(req: Pick<Request, 'originalUrl' | 'url' | 'path'>): string {
  const raw =
    (typeof req.originalUrl === 'string' && req.originalUrl) ||
    (typeof req.url === 'string' && req.url) ||
    (typeof req.path === 'string' && req.path) ||
    '';
  return raw.split('?')[0] ?? '';
}

/**
 * Limits JWTs issued with `tokenPurpose: PASSWORD_CHANGE_ONLY` to
 * `POST /api/auth/change-password` until the user completes the flow.
 */
@Injectable()
export class PasswordChangeScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<string>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<
      Request & { user?: { tokenPurpose?: string } }
    >();
    if (req.user?.tokenPurpose !== 'PASSWORD_CHANGE_ONLY') {
      return true;
    }

    const method = (req.method ?? 'GET').toUpperCase();
    const path = normalizedPath(req);
    const ok =
      method === 'POST' && path.endsWith('/auth/change-password');
    if (!ok) {
      throw new ForbiddenException(
        'Password change required — complete POST /api/auth/change-password before using the application.',
      );
    }
    return true;
  }
}
