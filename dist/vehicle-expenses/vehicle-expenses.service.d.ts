import { Prisma, SafariRole, VehicleExpenseStatus, VehicleExpenseType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export declare class VehicleExpensesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(userId: string, safariRole: SafariRole, dto: {
        vehiclePlate: string;
        vehicleLabel?: string;
        expenseType: VehicleExpenseType;
        amount: number;
        odometerKm?: number;
        vendorName?: string;
        description?: string;
        expenseDate?: string;
        receiptUrl: string;
    }): Promise<{
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
        description: string | null;
        id: string;
        amount: Prisma.Decimal;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.VehicleExpenseStatus;
        receiptUrl: string;
        vehicleLabel: string | null;
        expenseDate: Date;
        rejectionReason: string | null;
        vehiclePlate: string;
        expenseType: import("@prisma/client").$Enums.VehicleExpenseType;
        odometerKm: number | null;
        vendorName: string | null;
        submittedById: string;
        reviewedById: string | null;
        reviewedAt: Date | null;
    }>;
    listForUser(userId: string, safariRole: SafariRole, filters: {
        from?: string;
        to?: string;
        status?: VehicleExpenseStatus;
        expenseType?: VehicleExpenseType;
        vehiclePlate?: string;
    }): Promise<({
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
        description: string | null;
        id: string;
        amount: Prisma.Decimal;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.VehicleExpenseStatus;
        receiptUrl: string;
        vehicleLabel: string | null;
        expenseDate: Date;
        rejectionReason: string | null;
        vehiclePlate: string;
        expenseType: import("@prisma/client").$Enums.VehicleExpenseType;
        odometerKm: number | null;
        vendorName: string | null;
        submittedById: string;
        reviewedById: string | null;
        reviewedAt: Date | null;
    })[]>;
    listPendingApproval(safariRole: SafariRole): Promise<({
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
        description: string | null;
        id: string;
        amount: Prisma.Decimal;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.VehicleExpenseStatus;
        receiptUrl: string;
        vehicleLabel: string | null;
        expenseDate: Date;
        rejectionReason: string | null;
        vehiclePlate: string;
        expenseType: import("@prisma/client").$Enums.VehicleExpenseType;
        odometerKm: number | null;
        vendorName: string | null;
        submittedById: string;
        reviewedById: string | null;
        reviewedAt: Date | null;
    })[]>;
    updateStatus(id: string, safariRole: SafariRole, actorUserId: string, dto: {
        status: VehicleExpenseStatus;
        rejectionReason?: string;
    }): Promise<{
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
        description: string | null;
        id: string;
        amount: Prisma.Decimal;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.VehicleExpenseStatus;
        receiptUrl: string;
        vehicleLabel: string | null;
        expenseDate: Date;
        rejectionReason: string | null;
        vehiclePlate: string;
        expenseType: import("@prisma/client").$Enums.VehicleExpenseType;
        odometerKm: number | null;
        vendorName: string | null;
        submittedById: string;
        reviewedById: string | null;
        reviewedAt: Date | null;
    }>;
    getReport(safariRole: SafariRole, filters: {
        from: string;
        to: string;
    }): Promise<{
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
}
