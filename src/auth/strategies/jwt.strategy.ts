import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export type JwtPayload = {
  sub: string;
  role: string;
  /** Present for branch-scoped staff (manager, driver, …). */
  branchId?: string | null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET ?? 'safari-dev-jwt-secret-change-in-production',
    });
  }

  validate(payload: JwtPayload): {
    userId: string;
    role: string;
    branchId: string | null;
  } {
    return {
      userId: payload.sub,
      role: payload.role,
      branchId: payload.branchId ?? null,
    };
  }
}
