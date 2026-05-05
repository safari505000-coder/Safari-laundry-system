import { SafariRole } from "@prisma/client";
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { ConfirmHandoverDto } from '../dto/confirm-handover.dto';
import type { DriverBalanceResponseDto, HandoverResultDto } from '../dto/driver-balance.dto';
import type { DriverCashTraceQueryDto, DriverCashTraceResponseDto } from '../dto/driver-cash-trace.dto';
import type { UpdateDriverTrackingDto } from '../dto/update-driver-tracking.dto';
import type { CashReconciliationSnapshotDto } from '../dto/cash-reconciliation.dto';
export declare class CashService {
    private readonly prisma;
    private readonly auditLogs;
    constructor(prisma: PrismaService, auditLogs: AuditLogsService);
    ensureOpenShiftForDriver(driverId: string): Promise<void>;
    getDailyPosSalesByPaymentMethod(fromIso: string, toIso: string, scopedDriverId?: string): Promise<{
        from: string;
        to: string;
        rows: {
            posPaymentMethod: import(".prisma/client").$Enums.PosPaymentMethod;
            orderCount: number;
            totalRevenue: string;
        }[];
    }>;
    getDriverBalances(): Promise<DriverBalanceResponseDto>;
    getTotalCashWithDrivers(): Promise<string>;
    getDriverMonitoring(branchId?: string | null): Promise<{
        drivers: {
            driverId: string;
            fullName: string;
            username: string;
            phone: string | null;
            vehicleLabel: string;
            status: "ON_SHIFT";
            source: "LIVE_GPS" | "BRANCH_FALLBACK";
            lastKnownLocation: {
                lat: number;
                lng: number;
            } | null;
            markerLocation: {
                lat: number;
                lng: number;
            } | null;
            branch: {
                name: string;
                id: string;
                location: string;
            } | null;
        }[];
    }>;
    updateDriverTracking(driverId: string, dto: UpdateDriverTrackingDto): Promise<{
        id: string;
        username: string;
        fullName: string;
        vehicleLabel: string | null;
        lastKnownLocation: string | null;
    }>;
    confirmHandover(managerId: string, actorRole: SafariRole, dto: ConfirmHandoverDto): Promise<HandoverResultDto>;
    getDriverCashTrace(query: DriverCashTraceQueryDto): Promise<DriverCashTraceResponseDto>;
    getCashReconciliationSnapshot(query: DriverCashTraceQueryDto): Promise<CashReconciliationSnapshotDto>;
    getOwnerFinancialCycleReport(): Promise<{
        rows: {
            orderId: string;
            amountKd: string;
            collectedAt: string | null;
            collectedByManager: {
                id: string;
                username: string;
                fullName: string;
            } | null;
            depositLogId: string | null;
            receiptImageUrl: string | null;
            verifiedAt: string | null;
            verifiedByAccountant: {
                id: string;
                username: string;
                fullName: string;
            } | null;
            lastUpdatedAt: string;
        }[];
    }>;
}
