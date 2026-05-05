import { CashStatus, ManagerCashCustodyStatus, PrismaClient } from "@prisma/client";
import { Pool } from 'pg';
export type AccountantDashboardTestContext = {
    prisma: PrismaClient;
    pool: Pool;
    runId: string;
    branchId: string;
    managerId: string;
    driverAId: string;
    driverBId: string;
    customerId: string;
    accountantId: string;
    dispose: () => Promise<void>;
};
export declare function createAccountantDashboardTestContext(): Promise<AccountantDashboardTestContext>;
export type CashOrderParams = {
    driverId: string | null;
    totalPrice: string;
    completedAt: Date;
    cashStatus?: CashStatus;
};
export declare function insertCompletedCashOrder(ctx: AccountantDashboardTestContext, p: CashOrderParams): Promise<string>;
export declare function insertCustodyHandover(ctx: AccountantDashboardTestContext, p: {
    driverId: string;
    amountKd: string;
    receivedFromDriverAt: Date;
    status?: ManagerCashCustodyStatus;
    slipUploadedAt?: Date | null;
}): Promise<string>;
export declare function insertApprovedExpense(ctx: AccountantDashboardTestContext, p: {
    amount: string;
    expenseDate: Date;
}): Promise<void>;
