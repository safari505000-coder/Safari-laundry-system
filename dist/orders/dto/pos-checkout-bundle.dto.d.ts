import { ServiceType } from "@prisma/client";
import { OrderLineItemDto } from './order-line-item.dto';
export declare class PosCheckoutBundlePartDto {
    totalPrice: number;
    lineItems?: OrderLineItemDto[];
}
export declare class PosCheckoutBundleDto {
    customerPhone: string;
    customerId?: string;
    customerDisplayName?: string;
    customerAddress?: string;
    serviceType?: ServiceType;
    orders: PosCheckoutBundlePartDto[];
}
