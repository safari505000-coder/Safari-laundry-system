export declare const MARK_PAID_METHODS: readonly ["CASH", "KNET", "PAYMENT_LINK", "ONLINE"];
export type MarkPaidMethod = (typeof MARK_PAID_METHODS)[number];
export declare class MarkOrderPaidDto {
    paymentMethod: MarkPaidMethod;
}
