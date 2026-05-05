import { VehicleExpenseType } from "@prisma/client";
export declare class CreateVehicleExpenseDto {
    vehiclePlate: string;
    vehicleLabel?: string;
    expenseType: VehicleExpenseType;
    amount: number;
    odometerKm?: number;
    vendorName?: string;
    description?: string;
    expenseDate?: string;
    receiptUrl: string;
}
