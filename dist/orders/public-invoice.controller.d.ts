import { StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { OrdersService } from './orders.service';
export declare class PublicInvoiceController {
    private readonly orders;
    constructor(orders: OrdersService);
    getPdfByQuery(token: string | undefined, res: Response): Promise<StreamableFile>;
    getPdfByParam(token: string, res: Response): Promise<StreamableFile>;
    private servePublicInvoicePdf;
    get(token: string): Promise<{
        status: import(".prisma/client").$Enums.OrderStatus;
        customer: {
            wallet: {
                balance: import("@prisma/client-runtime-utils/dist").Decimal;
                debt: import("@prisma/client-runtime-utils/dist").Decimal;
            } | null;
            id: string;
            phone: string;
            address: string | null;
            phone2: string | null;
            displayName: string | null;
        };
        id: string;
        createdAt: Date;
        updatedAt: Date;
        driver: {
            branch: {
                name: string;
                id: string;
            } | null;
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            phone: string | null;
            safariRole: import(".prisma/client").$Enums.SafariRole;
        } | null;
        serviceType: import(".prisma/client").$Enums.ServiceType;
        totalPrice: import("@prisma/client-runtime-utils/dist").Decimal;
        cashStatus: import(".prisma/client").$Enums.CashStatus;
        invoiceNumber: string | null;
        serialNumber: string | null;
        reminderCount: number;
        lastReminderAt: Date | null;
        notes: string | null;
        posPaymentMethod: import(".prisma/client").$Enums.PosPaymentMethod;
        completedAt: Date | null;
        walletSettledAt: Date | null;
        dispatchId: string | null;
        lineItems: {
            id: string;
            quantity: import("@prisma/client-runtime-utils/dist").Decimal;
            label: string | null;
            starchOption: import(".prisma/client").$Enums.StarchOption;
            unitPrice: import("@prisma/client-runtime-utils/dist").Decimal;
        }[];
    }>;
}
