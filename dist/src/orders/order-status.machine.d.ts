import { OrderStatus } from '@prisma/client';
export declare function assertOrderStatusTransition(current: OrderStatus, next: OrderStatus, hasDriver: boolean): void;
