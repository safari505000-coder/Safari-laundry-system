import { ServiceType } from '@prisma/client';
import { OrderLineItemDto } from './order-line-item.dto';
export declare class CreateOrderQuickDto {
    customerPhone: string;
    customerId?: string;
    customerDisplayName?: string;
    totalPrice: number;
    invoiceNumber?: string;
    notes?: string;
    customerAddress?: string;
    serviceType?: ServiceType;
    lineItems?: OrderLineItemDto[];
}
