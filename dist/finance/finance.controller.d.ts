import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { ConfirmHandoverDto } from './dto/confirm-handover.dto';
import { DebtByCategoryQueryDto } from './dto/debt-by-category-query.dto';
import { OpenDebtByIssuerQueryDto, OpenDebtByIssuerResponseDto } from './dto/open-debt-by-issuer.dto';
import { DailyPosSalesQueryDto } from './dto/daily-pos-sales-query.dto';
import { DriverBalanceResponseDto, HandoverResultDto } from './dto/driver-balance.dto';
import { CashReconciliationQueryDto, type CashReconciliationSnapshotDto } from './dto/cash-reconciliation.dto';
import { DriverCashTraceQueryDto, DriverCashTraceResponseDto } from './dto/driver-cash-trace.dto';
import { OwnerCustomerWalletSummaryDto } from './dto/owner-customer-wallet-summary.dto';
import { UpdateDriverTrackingDto } from './dto/update-driver-tracking.dto';
import { UnpaidInvoicesQueryDto, UnpaidInvoicesResponseDto } from './dto/unpaid-invoices.dto';
import { AccountantDashboardQueryDto } from './dto/accountant-dashboard-query.dto';
import { FinanceService } from './finance.service';
import { AccountantDashboardService } from './services/accountant-dashboard.service';
import { OwnerFinancialDashboardService } from './services/owner-financial-dashboard.service';
export declare class FinanceController {
    private readonly financeService;
    private readonly accountantDashboard;
    private readonly ownerFinancialDashboard;
    constructor(financeService: FinanceService, accountantDashboard: AccountantDashboardService, ownerFinancialDashboard: OwnerFinancialDashboardService);
    driverEnsureShift(user: JwtUser): Promise<{
        ok: boolean;
    }>;
    getOwnerCustomerWalletSummary(): Promise<OwnerCustomerWalletSummaryDto>;
    getOwnerFinancialDashboard(): Promise<import("./dto/owner-financial-dashboard.dto").OwnerFinancialDashboardDto>;
    getConsolidatedCashSnapshot(): Promise<import("./finance.service").ConsolidatedCashSnapshotDto>;
    getDailyPosSales(q: DailyPosSalesQueryDto, user: JwtUser): Promise<{
        from: string;
        to: string;
        rows: {
            posPaymentMethod: import(".prisma/client").$Enums.PosPaymentMethod;
            orderCount: number;
            totalRevenue: string;
        }[];
    }>;
    getDebtByCategory(q: DebtByCategoryQueryDto): Promise<{
        from: string;
        to: string;
        rows: {
            category: import(".prisma/client").$Enums.DebtEntityCategory;
            source: import(".prisma/client").$Enums.DebtSource;
            entryCount: number;
            totalDebt: string;
        }[];
    }>;
    getOpenDebtByIssuer(q: OpenDebtByIssuerQueryDto): Promise<OpenDebtByIssuerResponseDto>;
    uploadHandoverReceipt(file: Express.Multer.File): {
        depositReceiptUrl: string;
    };
    getDriverBalance(): Promise<DriverBalanceResponseDto>;
    getDriverMonitoring(user: JwtUser): Promise<{
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
    confirmHandover(dto: ConfirmHandoverDto, user: JwtUser): Promise<HandoverResultDto>;
    getFinancialCycleReport(): Promise<{
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
    getCashReconciliation(query: CashReconciliationQueryDto): Promise<CashReconciliationSnapshotDto>;
    getUnpaidInvoices(query: UnpaidInvoicesQueryDto): Promise<UnpaidInvoicesResponseDto>;
    getDashboardSummary(q: AccountantDashboardQueryDto): Promise<{
        window: import("./services/accountant-dashboard.service").ResolvedDashboardWindow;
        kpis: {
            totalSales: {
                valueKd: string;
                previousKd: string;
                count: number | undefined;
                trendPctVsPrevious: number;
                trendDirection: "flat" | "up" | "down";
                drilldownType: string;
            };
            cashCollected: {
                valueKd: string;
                previousKd: string;
                count: number | undefined;
                trendPctVsPrevious: number;
                trendDirection: "flat" | "up" | "down";
                drilldownType: string;
            };
            cashWithDrivers: {
                valueKd: string;
                snapshot: boolean;
                trendPctVsPrevious: number;
                trendDirection: "flat";
                drilldownType: string;
            };
            cashWithManagers: {
                valueKd: string;
                count: number;
                snapshot: boolean;
                trendPctVsPrevious: number;
                trendDirection: "flat";
                drilldownType: string;
            };
            bankDeposited: {
                valueKd: string;
                previousKd: string;
                count: number | undefined;
                trendPctVsPrevious: number;
                trendDirection: "flat" | "up" | "down";
                drilldownType: string;
            };
            netProfit: {
                valueKd: string;
                previousKd: string;
                count: number | undefined;
                trendPctVsPrevious: number;
                trendDirection: "flat" | "up" | "down";
                drilldownType: string;
            };
        };
        pipeline: {
            stages: {
                key: string;
                label: string;
                amountKd: string;
                count: number;
                avgDelayHours: number;
                tone: "green" | "yellow" | "red";
            }[];
        };
        expenses: {
            totalKd: string;
            topCategory: import(".prisma/client").ExpenseCategory | null;
            expenseRatioVsSales: string | null;
        };
        charts: {
            profitOverTime: {
                day: string;
                netKd: string;
            }[];
            salesVsExpenses: {
                day: string;
                salesKd: string;
                expensesKd: string;
            }[];
            cashStagesTrend: {
                day: string;
                collectedKd: string;
                handedKd: string;
            }[];
        };
        drilldowns: {
            openCustodyBags: {
                id: string;
                amountKd: string;
                status: import(".prisma/client").$Enums.ManagerCashCustodyStatus;
                managerName: string;
                driverName: string;
                ageHours: number;
                isOverdue: boolean;
            }[];
            pendingDrivers: {
                driverId: string;
                name: string;
                pendingKd: string;
                lastCompletedAt: string;
            }[];
        };
        cacheTtlSec: number;
    }>;
    getReconciliationExplain(q: AccountantDashboardQueryDto): Promise<{
        window: {
            fromIso: string;
            toIso: string;
        };
        byDate: {
            day: string;
            collectedKd: string;
            handedKd: string;
        }[];
        byDriver: {
            driverId: string;
            name: string;
            collectedKd: string;
            handedKd: string;
            shortfallKd: string;
        }[];
        byManager: {
            managerId: string;
            name: string;
            handedKd: string;
            bagCount: number;
        }[];
        totalShortfallKd: string;
        totalDeltaKd: string;
        summaryLabels: {
            driverHoldsLine: string | null;
            officeHoldsLine: string | null;
        };
        narratives: string[];
    }>;
    getFinanceReconciliation(q: AccountantDashboardQueryDto): Promise<{
        window: {
            fromIso: string;
            toIso: string;
        };
        collected: {
            kd: string;
            orderCount: number;
        };
        handed: {
            kd: string;
            bagCount: number;
        };
        pendingDrivers: {
            kd: string;
        };
        pendingManagers: {
            kd: string;
        };
        differenceKd: string;
        deltaKd: string;
        shortfallKd: string;
        status: import("./utils/accountant-dashboard-math").ReconciliationDisplayStatus;
        badge: "green" | "yellow" | "red";
    }>;
    getFinanceAlerts(q: AccountantDashboardQueryDto, user: JwtUser): Promise<{
        alerts: {
            id: string;
            severity: "HIGH" | "MEDIUM" | "LOW";
            code: string;
            title: string;
            detail: string;
            drilldownType: string;
            refId?: string;
        }[];
        generatedAt: string;
    }>;
    getFinanceInsights(q: AccountantDashboardQueryDto): Promise<{
        lines: string[];
        generatedAt: string;
    }>;
    getRealtimeTotals(): Promise<{
        totalCash: string;
        totalOnline: string;
        totalDebt: string;
        totalSubscriptionUsage: string;
    }>;
}
