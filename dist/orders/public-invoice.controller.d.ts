import { OrdersService } from './orders.service';
export declare class PublicInvoiceController {
    private readonly orders;
    constructor(orders: OrdersService);
    get(token: string): Promise<{
        customer: {
            wallet: {
                balance: import("@prisma/client-runtime-utils").Decimal;
                debt: import("@prisma/client-runtime-utils").Decimal;
            } | null;
            id: string;
            phone: string;
            phone2: string | null;
            displayName: string | null;
            address: string | null;
        };
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.OrderStatus;
        serviceType: import("@prisma/client").$Enums.ServiceType;
        totalPrice: import("@prisma/client-runtime-utils").Decimal;
        cashStatus: import("@prisma/client").$Enums.CashStatus;
        invoiceNumber: string | null;
        serialNumber: string | null;
        reminderCount: number;
        lastReminderAt: Date | null;
        notes: string | null;
        posPaymentMethod: import("@prisma/client").$Enums.PosPaymentMethod | null;
        completedAt: Date | null;
        walletSettledAt: Date | null;
        driver: {
            branch: {
                id: string;
                name: string;
            } | null;
            id: string;
            phone: string | null;
            username: string;
            employeeId: string | null;
            fullName: string;
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
