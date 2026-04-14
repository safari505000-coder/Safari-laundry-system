import { SafariRole } from '@prisma/client';
export declare const ROLES_KEY = "safariRoles";
export declare const Roles: (...roles: SafariRole[]) => import("@nestjs/common").CustomDecorator<string>;
