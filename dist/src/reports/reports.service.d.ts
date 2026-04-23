import { PosPaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExpensesService } from '../expenses/expenses.service';
import { FixedExpenseService } from '../fixed-expenses/fixed-expense.service';
import { PaymentMethodFeesService } from '../payment-method-fees/payment-method-fees.service';
import { PayrollService } from '../payroll/payroll.service';
export declare class ReportsService {
    private readonly prisma;
    private readonly expensesService;
    private readonly payrollService;
    private readonly fixedExpenseService;
    private readonly paymentMethodFeesService;
    constructor(prisma: PrismaService, expensesService: ExpensesService, payrollService: PayrollService, fixedExpenseService: FixedExpenseService, paymentMethodFeesService: PaymentMethodFeesService);
    private parseRange;
    private ordersForBranch;
    private getSubscriptionSubsidyInRange;
    issuedInvoices(fromIso: string, toIso: string, driverId?: string, posPaymentMethod?: PosPaymentMethod, branchId?: string): Promise<{
        from: string;
        to: string;
        count: number;
        rows: {
            totalPrice: string;
            id: string;
            createdAt: Date;
            customer: {
                id: string;
                phone: string;
                displayName: string | null;
            };
            status: import("@prisma/client").$Enums.OrderStatus;
            serviceType: import("@prisma/client").$Enums.ServiceType;
            cashStatus: import("@prisma/client").$Enums.CashStatus;
            invoiceNumber: string | null;
            posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
            completedAt: Date | null;
            driver: {
                id: string;
                branchId: string | null;
                username: string;
                employeeId: string | null;
                fullName: string;
            } | null;
        }[];
    }>;
    liveFeedRecent(limit?: number): Promise<{
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
    driverLedger(driverId: string, fromIso: string, toIso: string, branchId?: string): Promise<{
        driver: {
            id: string;
            branchId: string | null;
            username: string;
            phone: string | null;
            employeeId: string | null;
            fullName: string;
            safariRole: import("@prisma/client").$Enums.SafariRole;
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
    dailyCashClosing(fromIso: string, toIso: string, branchId?: string, driverId?: string): Promise<{
        from: string;
        to: string;
        grossCashSalesKd: string;
        expensesTotalKd: string;
        netCashAfterExpensesKd: string;
        cashOrderCount: number;
    }>;
    private aggregateBankFeesForCompletedOrders;
    netProfitExecutive(fromIso: string, toIso: string, branchId?: string, driverId?: string): Promise<{
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
    private computeCollectionsForRange;
    private computeDebtPaymentsInRange;
    private computeOutstandingDebtBreakdown;
    monthlySummary(fromIso: string, toIso: string): Promise<{
        from: string;
        to: string;
        consolidated: {
            grossRevenueKd: string;
            bankFeesTotalKd: string;
            settledRevenueAfterBankFeesKd: string;
            variableSoapFuelKd: string;
            miscOperationalKd: string;
            fixedExpensesKd: string;
            payrollPaidKd: string;
            totalExpensesVariableAndFixedKd: string;
            subscriptionSubsidyKd: string;
            netProfitKd: string;
            collectedRevenueKd: string;
            uncollectedRevenueKd: string;
            debtPaymentsReceivedKd: string;
            outstandingInvoiceDebtKd: string;
            outstandingSubscriptionDebtKd: string;
            outstandingDebtKd: string;
        };
        branches: {
            branchId: string;
            branchName: string;
            grossRevenueKd: string;
            bankFeesTotalKd: string;
            settledRevenueAfterBankFeesKd: string;
            variableSoapFuelKd: string;
            miscOperationalKd: string;
            fixedExpensesKd: string;
            payrollPaidKd: string;
            totalExpensesVariableAndFixedKd: string;
            subscriptionSubsidyKd: string;
            netProfitKd: string;
            collectedRevenueKd: string;
            uncollectedRevenueKd: string;
            debtPaymentsReceivedKd: string;
            outstandingInvoiceDebtKd: string;
            outstandingSubscriptionDebtKd: string;
            outstandingDebtKd: string;
        }[];
        inventoryConsumption: {
            branches: readonly [];
        } | {
            branches: {
                branchId: string;
                branchName: string;
                lines: {
                    stockItemId: string;
                    code: string;
                    nameAr: string;
                    unit: string;
                    quantityConsumed: string;
                    movementCount: number;
                }[];
            }[];
        };
    }>;
    private computeMonthlyInventoryConsumption;
    bankFeesByBranch(fromIso: string, toIso: string): Promise<{
        from: string;
        to: string;
        totalBankFeesKd: string;
        branches: {
            branchId: string | null;
            bankFeesKd: string;
        }[];
    }>;
    unifiedLedgerStream(fromIso: string, toIso: string, driverId?: string, branchId?: string): Promise<{
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
    private branchWhere;
}
