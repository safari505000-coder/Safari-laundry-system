import { ExpenseCategory } from "@prisma/client";
import { PrismaService } from '../../prisma/prisma.service';
import { CashService } from './cash.service';
import { AccountantDashboardPeriod, AccountantDashboardQueryDto } from '../dto/accountant-dashboard-query.dto';
import { FinanceDashboardCacheService } from './finance-dashboard-cache.service';
export type ResolvedDashboardWindow = {
    period: AccountantDashboardPeriod;
    current: {
        fromIso: string;
        toIso: string;
    };
    previous: {
        fromIso: string;
        toIso: string;
    };
};
export declare class AccountantDashboardService {
    private readonly prisma;
    private readonly cashService;
    private readonly cache;
    constructor(prisma: PrismaService, cashService: CashService, cache: FinanceDashboardCacheService);
    resolveWindow(period: AccountantDashboardPeriod, now?: Date): {
        cur: {
            from: Date;
            to: Date;
        };
        prev: {
            from: Date;
            to: Date;
        };
    };
    getDashboardSummary(q: AccountantDashboardQueryDto): Promise<{
        window: ResolvedDashboardWindow;
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
            topCategory: ExpenseCategory | null;
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
    private buildDashboardSummary;
    getReconciliation(q: AccountantDashboardQueryDto): Promise<{
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
        status: import("../utils/accountant-dashboard-math").ReconciliationDisplayStatus;
        badge: "green" | "yellow" | "red";
    }>;
    private buildReconciliation;
    explainReconciliation(q: AccountantDashboardQueryDto): Promise<{
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
    private buildExplain;
    getAlerts(q: AccountantDashboardQueryDto): Promise<{
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
    private buildAlerts;
    getInsights(q: AccountantDashboardQueryDto): Promise<{
        lines: string[];
        generatedAt: string;
    }>;
    private sumCompletedSales;
    private sumCashCollected;
    private sumHandedInWindow;
    private sumFieldCashKd;
    private sumManagerCustodyOpenKd;
    private sumManagerDepositRejectedKd;
    private sumVerifiedCustody;
    private glNet;
    private sumApprovedExpenses;
    private expenseInsights;
    private dailySeries;
    private buildPipeline;
    private drilldownManagerBags;
    private drilldownPendingDrivers;
    private reconciliationByKuwaitDay;
}
