import { PosPaymentMethod } from '@prisma/client';
export declare class EditInvoiceDto {
    totalPrice?: string;
    posPaymentMethod?: PosPaymentMethod;
    notes?: string;
    reason?: string;
}
