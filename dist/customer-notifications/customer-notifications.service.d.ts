export type InvoiceIssuedNotifyParams = {
    customerPhone: string;
    orderId: string;
    invoiceLabel: string;
    amountKd: string;
    paymentUrl?: string;
    invoiceShareUrl?: string;
    invoiceShareItems?: Array<{
        label: string;
        url: string;
    }>;
};
export type InvoiceEditedIssuerNotifyParams = {
    toPhone: string;
    orderId: string;
    invoiceLabel: string;
    newAmountKd: string;
    editorLabel: string;
    invoiceShareUrl?: string;
};
export declare class CustomerNotificationsService {
    private readonly logger;
    notifyInvoiceIssued(params: InvoiceIssuedNotifyParams): void;
    notifyInvoiceEditedForIssuer(params: InvoiceEditedIssuerNotifyParams): void;
    private deliver;
    private deliverIssuerEdit;
}
