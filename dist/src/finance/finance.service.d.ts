import { DebtEntityCategory, PosPaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfirmHandoverDto } from './dto/confirm-handover.dto';
import type { DriverBalanceResponseDto, HandoverResultDto } from './dto/driver-balance.dto';
import type { OwnerCustomerWalletSummaryDto } from './dto/owner-customer-wallet-summary.dto';
import type { UpdateDriverTrackingDto } from './dto/update-driver-tracking.dto';
export declare class FinanceService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    ensureOpenShiftForDriver(driverId: string): Promise<void>;
    getDailyPosSalesByPaymentMethod(fromIso: string, toIso: string): Promise<{
        from: string;
        to: string;
        rows: {
            posPaymentMethod: PosPaymentMethod;
            orderCount: number;
            totalRevenue: string;
        }[];
    }>;
    getOwnerCustomerWalletSummary(): Promise<OwnerCustomerWalletSummaryDto>;
    getDebtBreakdownByCategory(fromIso: string, toIso: string, category?: DebtEntityCategory, branchId?: string, actorUserId?: string): Promise<{
        from: string;
        to: string;
        rows: {
            category: import("@prisma/client").$Enums.DebtEntityCategory;
            source: import("@prisma/client").$Enums.DebtSource;
            entryCount: number;
            totalDebt: string;
        }[];
    }>;
    getDriverBalances(): Promise<DriverBalanceResponseDto>;
    getDriverMonitoring(): Promise<{
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
                id: string;
                name: string;
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
    confirmHandover(managerId: string, dto: ConfirmHandoverDto): Promise<HandoverResultDto>;
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
