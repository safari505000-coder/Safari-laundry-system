import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { CreateVehicleExpenseDto } from './dto/create-vehicle-expense.dto';
import { UpdateVehicleExpenseStatusDto } from './dto/update-vehicle-expense-status.dto';
import { VehicleExpensesQueryDto } from './dto/vehicle-expenses-query.dto';
import { VehicleExpensesService } from './vehicle-expenses.service';
export declare class VehicleExpensesController {
    private readonly service;
    constructor(service: VehicleExpensesService);
    create(dto: CreateVehicleExpenseDto, user: JwtUser): Promise<{
        submittedBy: {
            id: string;
            username: string;
            fullName: string;
        };
        reviewedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        amount: import("@prisma/client-runtime-utils").Decimal;
        vehicleLabel: string | null;
        status: import("@prisma/client").$Enums.VehicleExpenseStatus;
        receiptUrl: string;
        expenseDate: Date;
        rejectionReason: string | null;
        vehiclePlate: string;
        expenseType: import("@prisma/client").$Enums.VehicleExpenseType;
        odometerKm: number | null;
        vendorName: string | null;
        description: string | null;
        submittedById: string;
        reviewedById: string | null;
        reviewedAt: Date | null;
    }>;
    list(q: VehicleExpensesQueryDto, user: JwtUser): Promise<({
        submittedBy: {
            id: string;
            username: string;
            fullName: string;
        };
        reviewedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        amount: import("@prisma/client-runtime-utils").Decimal;
        vehicleLabel: string | null;
        status: import("@prisma/client").$Enums.VehicleExpenseStatus;
        receiptUrl: string;
        expenseDate: Date;
        rejectionReason: string | null;
        vehiclePlate: string;
        expenseType: import("@prisma/client").$Enums.VehicleExpenseType;
        odometerKm: number | null;
        vendorName: string | null;
        description: string | null;
        submittedById: string;
        reviewedById: string | null;
        reviewedAt: Date | null;
    })[]>;
    listPendingApproval(user: JwtUser): Promise<({
        submittedBy: {
            id: string;
            username: string;
            fullName: string;
        };
        reviewedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        amount: import("@prisma/client-runtime-utils").Decimal;
        vehicleLabel: string | null;
        status: import("@prisma/client").$Enums.VehicleExpenseStatus;
        receiptUrl: string;
        expenseDate: Date;
        rejectionReason: string | null;
        vehiclePlate: string;
        expenseType: import("@prisma/client").$Enums.VehicleExpenseType;
        odometerKm: number | null;
        vendorName: string | null;
        description: string | null;
        submittedById: string;
        reviewedById: string | null;
        reviewedAt: Date | null;
    })[]>;
    report(from: string, to: string, user: JwtUser): Promise<{
        from: string;
        to: string;
        totalKd: string;
        count: number;
        byVehicle: {
            vehiclePlate: string;
            vehicleLabel: string | null;
            amountKd: string;
            count: number;
        }[];
        byType: {
            expenseType: import("@prisma/client").$Enums.VehicleExpenseType;
            amountKd: string;
            count: number;
        }[];
        byMonth: {
            month: string;
            amountKd: string;
            count: number;
        }[];
    }>;
    updateStatus(id: string, dto: UpdateVehicleExpenseStatusDto, user: JwtUser): Promise<{
        submittedBy: {
            id: string;
            username: string;
            fullName: string;
        };
        reviewedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        amount: import("@prisma/client-runtime-utils").Decimal;
        vehicleLabel: string | null;
        status: import("@prisma/client").$Enums.VehicleExpenseStatus;
        receiptUrl: string;
        expenseDate: Date;
        rejectionReason: string | null;
        vehiclePlate: string;
        expenseType: import("@prisma/client").$Enums.VehicleExpenseType;
        odometerKm: number | null;
        vendorName: string | null;
        description: string | null;
        submittedById: string;
        reviewedById: string | null;
        reviewedAt: Date | null;
    }>;
}
