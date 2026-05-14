import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { ExecutionContext } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../decorators/roles.decorator';

/**
 * حارس JWT — يتحقق من صحة access token لكل طلب ما لم تُعلَّم نقطة النهاية بـ @Public.
 * JWT auth guard — validates the bearer access token on every request unless the route is marked @Public.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<string>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}
