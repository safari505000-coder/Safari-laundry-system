import { OrderStatus } from "@prisma/client";
export declare class UpdateOrderDto {
    status?: OrderStatus;
    notes?: string;
}
