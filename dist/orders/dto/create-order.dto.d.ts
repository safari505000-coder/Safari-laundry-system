import { ServiceType } from '@prisma/client';
import { OrderLineItemDto } from './order-line-item.dto';
export declare class CreateOrderDto {
    customerPhone: string;
    customerAddress?: string;
    serviceType?: ServiceType;
    totalPrice: number;
    invoiceNumber?: string;
    notes?: string;
    driverId?: string;
    lineItems?: OrderLineItemDto[];
}
