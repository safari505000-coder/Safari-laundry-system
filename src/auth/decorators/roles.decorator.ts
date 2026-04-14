import { SetMetadata } from '@nestjs/common';
import { SafariRole } from '@prisma/client';

export const ROLES_KEY = 'safariRoles';

export const Roles = (...roles: SafariRole[]) => SetMetadata(ROLES_KEY, roles);
