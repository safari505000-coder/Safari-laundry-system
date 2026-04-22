import { DebtEntityCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfirmHandoverDto } from './dto/confirm-handover.dto';
import type { DriverBalanceResponseDto, HandoverResultDto } from './dto/driver-balance.dto';
import type { DriverCashTraceQueryDto, DriverCashTraceResponseDto } from './dto/driver-cash-trace.dto';
import type { OwnerCustomerWalletSummaryDto } from './dto/owner-customer-wallet-summary.dto';
import type { UnpaidInvoicesQueryDto, UnpaidInvoicesResponseDto } from './dto/unpaid-invoices.dto';
import type { UpdateDriverTrackingDto } from './dto/update-driver-tracking.dto';
import { CashService } from './services/cash.service';
import { DebtService } from './services/debt.service';
import { OnlinePaymentService } from './services/online-payment.service';
import { SubscriptionService } from './services/subscription.service';
export type ConsolidatedCashSnapshotDto = {
    atIso: string;
    driverFieldCashKd: string;
    managerCustodyPendingKd: string;
    branchWalletsKd: string;
    unverifiedBankDepositsKd: string;
    totalKd: string;
    breakdown: {
        driverCount: number;
        custodyBagCount: number;
        branchWalletCount: number;
        unverifiedBankDepositCount: number;
    };
};
export declare class FinanceService {
    private readonly prisma;
    private readonly cashService;
    private readonly debtService;
    private readonly onlinePaymentService;
    private readonly subscriptionService;
    constructor(prisma: PrismaService, cashService: CashService, debtService: DebtService, onlinePaymentService: OnlinePaymentService, subscriptionService: SubscriptionService);
    ensureOpenShiftForDriver(driverId: string): Promise<void>;
    getDailyPosSalesByPaymentMethod(fromIso: string, toIso: string, scopedDriverId?: string): Promise<{
        from: string;
        to: string;
        rows: {
            posPaymentMethod: "KNET" | "PAYMENT_LINK" | "ONLINE" | "SUBSCRIPTION_WALLET" | "CASH" | "DEBT_ON_ACCOUNT";
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
    getOpenDebtByIssuer(branchId?: string): Promise<import("./dto/open-debt-by-issuer.dto").OpenDebtByIssuerResponseDto>;
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
    getDriverCashTrace(query: DriverCashTraceQueryDto): Promise<DriverCashTraceResponseDto>;
    getUnpaidInvoices(query: UnpaidInvoicesQueryDto): Promise<UnpaidInvoicesResponseDto>;
    getConsolidatedCashSnapshot(): Promise<ConsolidatedCashSnapshotDto>;
    getRealtimeTotals(): Promise<{
        totalCash: string;
        totalOnline: string;
        totalDebt: string;
        totalSubscriptionUsage: string;
    }>;
}
