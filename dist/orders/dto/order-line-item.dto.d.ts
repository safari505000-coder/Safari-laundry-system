import { StarchOption } from '@prisma/client';
export declare class OrderLineItemDto {
    label?: string;
    quantity: number;
    starchOption?: StarchOption;
    unitPrice: number;
    stockItemId?: string;
}
