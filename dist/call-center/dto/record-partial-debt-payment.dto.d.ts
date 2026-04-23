export declare const DEBT_PAYMENT_METHODS: readonly ["CASH", "KNET", "PAYMENT_LINK", "ONLINE"];
export type DebtPaymentMethod = (typeof DEBT_PAYMENT_METHODS)[number];
export declare class RecordPartialDebtPaymentDto {
    amountKd: string;
    discountKd?: string;
    paymentMethod: DebtPaymentMethod;
    note?: string;
}
