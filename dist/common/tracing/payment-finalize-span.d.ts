export declare function withPaymentFinalizeSpan<T>(attrs: {
    orderId?: string;
    source?: string;
}, fn: () => Promise<T>): Promise<T>;
