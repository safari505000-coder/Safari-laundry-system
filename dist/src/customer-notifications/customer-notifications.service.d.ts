export type InvoiceIssuedNotifyParams = {
    customerPhone: string;
    orderId: string;
    invoiceLabel: string;
    amountKd: string;
    paymentUrl?: string;
};
export declare class CustomerNotificationsService {
    private readonly logger;
    notifyInvoiceIssued(params: InvoiceIssuedNotifyParams): void;
    private deliver;
}
