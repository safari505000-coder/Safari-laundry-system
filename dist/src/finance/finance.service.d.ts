import { DebtEntityCategory } from '@prisma/client';
import { ConfirmHandoverDto } from './dto/confirm-handover.dto';
import type { DriverBalanceResponseDto, HandoverResultDto } from './dto/driver-balance.dto';
import type { OwnerCustomerWalletSummaryDto } from './dto/owner-customer-wallet-summary.dto';
import type { UpdateDriverTrackingDto } from './dto/update-driver-tracking.dto';
import { CashService } from './services/cash.service';
import { DebtService } from './services/debt.service';
import { OnlinePaymentService } from './services/online-payment.service';
import { SubscriptionService } from './services/subscription.service';
export declare class FinanceService {
    private readonly cashService;
    private readonly debtService;
    private readonly onlinePaymentService;
    private readonly subscriptionService;
    constructor(cashService: CashService, debtService: DebtService, onlinePaymentService: OnlinePaymentService, subscriptionService: SubscriptionService);
    ensureOpenShiftForDriver(driverId: string): Promise<void>;
    getDailyPosSalesByPaymentMethod(fromIso: string, toIso: string, scopedDriverId?: string): Promise<{
        from: string;
        to: string;
        rows: {
            posPaymentMethod: "SUBSCRIPTION_WALLET" | "CASH" | "KNET" | "PAYMENT_LINK" | "DEBT_ON_ACCOUNT" | "ONLINE";
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
    getRealtimeTotals(): Promise<{
        totalCash: string;
        totalOnline: string;
        totalDebt: string;
        totalSubscriptionUsage: string;
    }>;
}
