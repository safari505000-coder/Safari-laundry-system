import type { OrderLineItemDto } from './dto/order-line-item.dto';
export declare function assertLineItemsMatchTotal(totalPrice: number, lineItems: OrderLineItemDto[]): void;
