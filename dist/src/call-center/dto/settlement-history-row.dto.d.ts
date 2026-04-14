import { LedgerTransactionType } from '@prisma/client';
export declare class SettlementHistoryRowDto {
    id: string;
    createdAt: Date;
    type: LedgerTransactionType;
    totalCollected?: string;
    debtSettled?: string;
    creditedToBalance?: string;
    balanceAfter: string;
    debtAfter: string;
    planName?: string;
    orderId?: string;
}
