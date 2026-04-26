import { SafariRole } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
export declare const ROLES_THAT_SEE_ADMINISTRATIVE_BRANCHES: SafariRole[];
export declare function canSeeAdministrativeBranches(role: string): boolean;
type DbClient = Pick<PrismaService, 'branch' | 'user'>;
export declare function assertBranchOperationalForCommerce(prisma: DbClient, branchId: string): Promise<void>;
export declare function assertUserNotOnAdministrativeBranchForSales(prisma: DbClient, userId: string): Promise<void>;
export {};
