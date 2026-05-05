import { PosPaymentMethod, StarchOption } from "@prisma/client";
export declare class EditInvoiceLineItemDto {
    id?: string;
    label?: string;
    starchOption?: StarchOption;
    quantity: string;
    unitPrice: string;
}
export declare class EditInvoiceDto {
    totalPrice?: string;
    posPaymentMethod?: PosPaymentMethod;
    notes?: string;
    reason?: string;
    lineItems?: EditInvoiceLineItemDto[];
}
