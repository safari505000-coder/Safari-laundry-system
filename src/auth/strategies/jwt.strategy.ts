import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JWT_SECRET_DEV_FALLBACK } from '../../common/constants/jwt-secret-fallback';

export type JwtPayload = {
  sub: string;
  role: string;
  /** Present for branch-scoped staff (manager, driver, …). */
  branchId?: string | null;
  scope?: 'ALL' | 'BRANCH' | 'OWN';
  /** B2C portal user — must match Customer id in path for `/customers/:id/360`. */
  linkedCustomerId?: string | null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? JWT_SECRET_DEV_FALLBACK,
    });
  }

  validate(payload: JwtPayload): {
    userId: string;
    role: string;
    branchId: string | null;
    scope?: 'ALL' | 'BRANCH' | 'OWN';
    linkedCustomerId: string | null;
  } {
    const role =
      typeof payload.role === 'string' && payload.role.trim() ?
        payload.role.trim().toUpperCase()
      : '';
    const linked =
      typeof payload.linkedCustomerId === 'string' && payload.linkedCustomerId.trim() ?
        payload.linkedCustomerId.trim()
      : null;
    return {
      userId: payload.sub,
      role,
      branchId: payload.branchId ?? null,
      scope: payload.scope,
      linkedCustomerId: linked,
    };
  }
}
