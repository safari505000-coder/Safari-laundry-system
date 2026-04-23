import { CashStatus, OrderStatus, PosPaymentMethod } from '@prisma/client';
export declare class ListOrdersQueryDto {
    driverId?: string;
    status?: OrderStatus;
    posPaymentMethod?: PosPaymentMethod;
    cashStatus?: CashStatus;
    from?: string;
    to?: string;
    q?: string;
}
