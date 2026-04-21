import { DriverLedgerQueryDto } from './dto/driver-ledger-query.dto';
import { LiveFeedQueryDto } from './dto/live-feed-query.dto';
import { ReportsRangeQueryDto } from './dto/reports-range-query.dto';
import { ReportsService } from './reports.service';
export declare class ReportsController {
    private readonly reportsService;
    constructor(reportsService: ReportsService);
    issuedInvoices(q: ReportsRangeQueryDto): Promise<{
        from: string;
        to: string;
        count: number;
        rows: {
            totalPrice: string;
            id: string;
            createdAt: Date;
            status: import("@prisma/client").$Enums.OrderStatus;
            serviceType: import("@prisma/client").$Enums.ServiceType;
            cashStatus: import("@prisma/client").$Enums.CashStatus;
            invoiceNumber: string | null;
            posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
            completedAt: Date | null;
            customer: {
                id: string;
                phone: string;
                displayName: string | null;
            };
            driver: {
                id: string;
                username: string;
                fullName: string;
                employeeId: string | null;
                branchId: string | null;
            } | null;
        }[];
    }>;
    liveFeed(q: LiveFeedQueryDto): Promise<{
        orders: {
            id: string;
            invoiceNumber: string | null;
            createdAt: string;
            totalPrice: string;
            customerName: string;
            branchName: string | null;
            branchId: string | null;
            lineItemCount: number;
            lines: {
                label: string | null;
                quantity: string;
                unitPrice: string;
            }[];
        }[];
    }>;
    driverLedger(q: DriverLedgerQueryDto): Promise<{
        driver: {
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            phone: string | null;
            safariRole: import("@prisma/client").$Enums.SafariRole;
            branchId: string | null;
        };
        owedToOfficeKd: string;
        pendingSettlementOrderCount: number;
        period: {
            from: string;
            to: string;
        };
        ordersInPeriod: {
            totalPrice: string;
            id: string;
            createdAt: Date;
            status: import("@prisma/client").$Enums.OrderStatus;
            cashStatus: import("@prisma/client").$Enums.CashStatus;
            invoiceNumber: string | null;
            posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
            completedAt: Date | null;
        }[];
    }>;
    dailyCashClosing(q: ReportsRangeQueryDto): Promise<{
        from: string;
        to: string;
        grossCashSalesKd: string;
        expensesTotalKd: string;
        netCashAfterExpensesKd: string;
        cashOrderCount: number;
    }>;
    executiveSummary(q: ReportsRangeQueryDto): Promise<{
        from: string;
        to: string;
        branchId: string | null;
        driverId: string | null;
        grossRevenueKd: string;
        bankFeesTotalKd: string;
        settledRevenueAfterBankFeesKd: string;
        variableSoapFuelKd: string;
        miscOperationalKd: string;
        fixedExpensesKd: string;
        subscriptionSubsidyKd: string;
        enterpriseSubscriptionSubsidyKd: string;
        payrollPaidKd: string;
        totalExpensesVariableAndFixedKd: string;
        netProfitKd: string;
    }>;
    bankFeesByBranch(q: ReportsRangeQueryDto): Promise<{
        from: string;
        to: string;
        totalBankFeesKd: string;
        branches: {
            branchId: string | null;
            bankFeesKd: string;
        }[];
    }>;
    unifiedLedgerStream(q: ReportsRangeQueryDto): Promise<{
        from: string;
        to: string;
        rows: {
            id: string;
            at: string;
            streamType: string;
            amountKd: string;
            memo: string | null;
            driverId: string | null;
            driverName: string | null;
            attachmentUrl: string | null;
            refKind: "ORDER" | "EXPENSE" | "DEPOSIT" | "GL";
            refId: string;
        }[];
    }>;
}
