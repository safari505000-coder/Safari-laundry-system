import { JwtService } from '@nestjs/jwt';
import { SafariRole, User } from '@prisma/client';
import { JWT_SECRET_DEV_FALLBACK } from '../../common/constants/jwt-secret-fallback';

export function signJwt(
  user: User,
  role: SafariRole = user.safariRole,
  branchId: string | null = user.branchId,
): string {
  const jwt = new JwtService({
    secret: process.env.JWT_SECRET ?? JWT_SECRET_DEV_FALLBACK,
  });

  return jwt.sign({
    sub: user.id,
    role,
    branchId,
    scope:
      role === SafariRole.OWNER || role === SafariRole.GENERAL_MANAGER
        ? 'ALL'
        : branchId
          ? 'BRANCH'
          : 'OWN',
    linkedCustomerId: user.linkedCustomerId,
  });
}
