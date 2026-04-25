export type CollectionsUnpaidTextRow = {
    orderId: string;
    readableId: string;
    invoiceNumber: string | null;
    customerName: string;
    amountKd: string;
    lineItems: {
        label: string | null;
        quantity: string;
        lineTotalKd: string;
    }[];
    branchName: string | null;
    driverName: string | null;
};
export declare function buildCollectionsPaymentLinkTextAr(row: CollectionsUnpaidTextRow, paymentUrl: string): string;
