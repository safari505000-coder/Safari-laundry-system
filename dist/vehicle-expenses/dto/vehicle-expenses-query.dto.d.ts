import { VehicleExpenseStatus, VehicleExpenseType } from "@prisma/client";
export declare class VehicleExpensesQueryDto {
    from?: string;
    to?: string;
    status?: VehicleExpenseStatus;
    expenseType?: VehicleExpenseType;
    vehiclePlate?: string;
}
