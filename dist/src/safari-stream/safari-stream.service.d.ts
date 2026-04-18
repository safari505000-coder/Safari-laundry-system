import { SafariRole } from '@prisma/client';
import { LaundryPriceListService } from '../laundry-price-list/laundry-price-list.service';
import { ManagerCustodyService } from '../manager-custody/manager-custody.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { OperatingHoursService } from '../system/operating-hours.service';
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
    institution: {
        allDriversFieldCashKd: string;
        allDriversPendingDepositsKd: string;
        financialDayNetProfitKd: string;
        financialDateIso: string;
    } | null;
    permissions: string[];
    priceListVersion: string;
    managerCustody: {
        fleet: {
            pendingAmountKd: string;
            overdueCount: number;
            overdueAmountKd: string;
        } | null;
        mine: {
            pendingCount: number;
            pendingAmountKd: string;
            overdueCount: number;
        } | null;
    };
};
export declare class SafariStreamService {
    private readonly prisma;
    private readonly permissionsService;
    private readonly operatingHours;
    private readonly reportsService;
    private readonly laundryPriceListService;
    private readonly managerCustodyService;
    constructor(prisma: PrismaService, permissionsService: PermissionsService, operatingHours: OperatingHoursService, reportsService: ReportsService, laundryPriceListService: LaundryPriceListService, managerCustodyService: ManagerCustodyService);
    private buildInstitutionRadar;
    buildSnapshot(userId: string, jwtRole: string): Promise<SafariStreamSnapshotDto>;
}
