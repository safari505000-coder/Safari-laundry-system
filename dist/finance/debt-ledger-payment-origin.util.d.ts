import { DebtSource, Prisma } from "@prisma/client";
export declare const REAL_PAYMENT_SOURCE_REF_PREFIXES: readonly ["PAYMENT:CASH:", "PAYMENT:KNET:", "PAYMENT:ONLINE:", "PAYMENT:PAYMENT_LINK:", "PAYMENT:CALL_CENTER_MANUAL:", "PAYMENT:PAYMENT_LINK_CALLBACK:", "PAYMENT:SUBSCRIPTION_ACTIVATION:", "PAYMENT:CC_DEBT_INVOICE_PHYSICAL:", "PAYMENT:CC_PARTIAL_DEBT_PAYMENT:"];
export type DebtPaymentLike = {
    source: DebtSource | string;
    amount: Prisma.Decimal | number | string;
    actorUserId?: string | null;
    sourceRef?: string | null;
    note?: string | null;
};
export declare function isRealDebtLedgerPayment(entry: DebtPaymentLike): boolean;
export declare function assertDebtLedgerPaymentWrite(input: {
    source: DebtSource | string;
    actorUserId?: string | null;
    sourceRef?: string | null;
}): void;
export declare function traceDebtLedgerPaymentWrite(input: {
    sourceFile: string;
    functionName: string;
    payload: Record<string, unknown>;
}): void;
