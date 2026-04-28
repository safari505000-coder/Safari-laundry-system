import { OnModuleInit } from '@nestjs/common';
export type InvoiceIssuedNotifyParams = {
    customerPhone: string;
    orderId: string;
    invoiceLabel: string;
    amountKd: string;
    paymentUrl?: string;
    invoiceShareUrl?: string;
    invoicePdfUrl?: string;
    invoiceShareItems?: Array<{
        label: string;
        url: string;
    }>;
    lineItemsSummary?: string;
};
export type InvoiceEditedIssuerNotifyParams = {
    toPhone: string;
    orderId: string;
    invoiceLabel: string;
    newAmountKd: string;
    editorLabel: string;
    invoiceShareUrl?: string;
    invoicePdfUrl?: string;
};
export type PaymentConfirmedNotifyParams = {
    customerPhone: string;
    orderId: string;
    orderLabel: string;
    amountKd: string;
    paymentUrl?: string;
    ratingUrl?: string;
    walletDebtKd?: string;
};
export type DriverCollectionConfirmedNotifyParams = {
    customerPhone: string;
    orderId: string;
    amountKd: string;
    paymentMethodLabelAr: string;
};
export declare class CustomerNotificationsService implements OnModuleInit {
    private readonly logger;
    private static moatmtCredsMissingLogged;
    private static moatmtShortTokenWarned;
    onModuleInit(): void;
    notifyInvoiceIssued(params: InvoiceIssuedNotifyParams): void;
    deliverInvoiceIssuedNow(params: InvoiceIssuedNotifyParams): Promise<void>;
    notifyInvoiceEditedForIssuer(params: InvoiceEditedIssuerNotifyParams): void;
    notifyPaymentConfirmed(params: PaymentConfirmedNotifyParams): void;
    notifyDriverCollectionConfirmed(params: DriverCollectionConfirmedNotifyParams): void;
    deliverCollectionsPaymentLinkNow(params: {
        customerPhone: string;
        orderId: string;
        message: string;
    }): Promise<boolean>;
    private deliver;
    private deliverPaymentConfirmed;
    private deliverDriverCollectionConfirmed;
    private deliverIssuerEdit;
    private buildMoatmtInvoiceMediaPayload;
    private buildMoatmtIssuerEditMediaPayload;
    private buildMoatmtMediaCaptionForInvoice;
    private trySendMoatmt;
    private moatmpPostOne;
    private moatmpLooksLikeMissingTokenError;
    private moatmpFetch;
    private moatmpResponseLooksLikeError;
}
