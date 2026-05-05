import { Prisma } from "@prisma/client";
export type DebtKdBreakdownWinner = 'ledger' | 'walletSnapshot' | 'orderMarket';
export type DebtKdBreakdownTrace = {
    ledgerNetKd: string;
    walletSnapshotKd: string;
    orderMarketScopeKd: string;
    operationalDebtKd: string;
    effectiveDebtKd: string;
    winningSources: DebtKdBreakdownWinner[];
};
export declare function buildDebtKdBreakdownTrace(ledgerNetKd: Prisma.Decimal, walletSnapshotKd: Prisma.Decimal, orderMarketScopeKd: Prisma.Decimal, effectiveKd: Prisma.Decimal): DebtKdBreakdownTrace;
