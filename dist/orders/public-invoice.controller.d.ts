import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { OrdersService } from './orders.service';
export declare class PublicInvoiceController {
    private readonly orders;
    constructor(orders: OrdersService);
    getPdfByQuery(token: string | undefined, res: Response): Promise<StreamableFile>;
    getPdfByParam(token: string, res: Response): Promise<StreamableFile>;
    private servePublicInvoicePdf;
    get(token: string): Promise<{
        customer: {
            wallet: {
                balance: import("@prisma/client-runtime-utils").Decimal;
                debt: import("@prisma/client-runtime-utils").Decimal;
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
        status: import("@prisma/client").$Enums.OrderStatus;
        cashStatus: import("@prisma/client").$Enums.CashStatus;
        walletSettledAt: Date | null;
        totalPrice: import("@prisma/client-runtime-utils").Decimal;
        reminderCount: number;
        serviceType: import("@prisma/client").$Enums.ServiceType;
        invoiceNumber: string | null;
        serialNumber: string | null;
        lastReminderAt: Date | null;
        notes: string | null;
        posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
        completedAt: Date | null;
        driver: {
            branch: {
                id: string;
                name: string;
            } | null;
            id: string;
            phone: string | null;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        } | null;
        lineItems: {
            id: string;
            quantity: import("@prisma/client-runtime-utils").Decimal;
            label: string | null;
            starchOption: import("@prisma/client").$Enums.StarchOption;
            unitPrice: import("@prisma/client-runtime-utils").Decimal;
        }[];
    }>;
}
