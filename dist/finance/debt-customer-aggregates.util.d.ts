import { Prisma } from '@prisma/client';
type Db = {
    debtLedgerEntry: Prisma.DebtLedgerEntryDelegate;
    customerWallet: Prisma.CustomerWalletDelegate;
};
export declare function getCustomerNetDebtFromDebtLedgerAgg(db: Db, customerId: string): Promise<{
    outstandingInvoiceDebtKd: Prisma.Decimal;
    outstandingSubscriptionDebtKd: Prisma.Decimal;
    netOpenDebtKd: Prisma.Decimal;
}>;
export declare function getCustomerDebtSnapshotTotalKd(db: Db, customerId: string): Promise<Prisma.Decimal>;
export {};
