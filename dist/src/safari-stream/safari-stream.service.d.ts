import { SafariRole } from '@prisma/client';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
export type SafariStreamSnapshotDto = {
    stream: 'safari-erp-v1';
    user: {
        id: string;
        username: string;
        fullName: string;
        phone: string | null;
        safariRole: SafariRole;
        branchId: string | null;
    };
    wallet: {
        fieldCashAvailableKd: string | null;
        pendingDepositHoldKd: string | null;
        pendingDebtOrdersKd: string | null;
    };
    permissions: string[];
};
export declare class SafariStreamService {
    private readonly prisma;
    private readonly permissionsService;
    constructor(prisma: PrismaService, permissionsService: PermissionsService);
    buildSnapshot(userId: string, jwtRole: string): Promise<SafariStreamSnapshotDto>;
}
