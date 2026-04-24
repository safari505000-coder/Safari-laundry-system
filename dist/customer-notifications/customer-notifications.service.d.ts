import { OnModuleInit } from '@nestjs/common';
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
export declare class CustomerNotificationsService implements OnModuleInit {
    private readonly logger;
    private static moatmtCredsMissingLogged;
    private static moatmtShortTokenWarned;
    onModuleInit(): void;
    notifyInvoiceIssued(params: InvoiceIssuedNotifyParams): void;
    deliverInvoiceIssuedNow(params: InvoiceIssuedNotifyParams): Promise<void>;
    notifyInvoiceEditedForIssuer(params: InvoiceEditedIssuerNotifyParams): void;
    private deliver;
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
