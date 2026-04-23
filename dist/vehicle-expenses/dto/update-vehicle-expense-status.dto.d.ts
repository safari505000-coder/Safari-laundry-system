import { VehicleExpenseStatus } from '@prisma/client';
export declare class UpdateVehicleExpenseStatusDto {
    status: VehicleExpenseStatus;
    rejectionReason?: string;
}
