import type { Request } from 'express';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderQuickDto } from './dto/create-order-quick.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { ManagerDashboardDto } from './dto/manager-dashboard.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrdersService } from './orders.service';
export declare class OrdersController {
    private readonly ordersService;
    constructor(ordersService: OrdersService);
    getManagerDashboard(): Promise<ManagerDashboardDto>;
    createQuick(dto: CreateOrderQuickDto, user: JwtUser): Promise<{
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
    create(dto: CreateOrderDto, user: JwtUser): Promise<{
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
    findAll(user: JwtUser, filters: ListOrdersQueryDto): Promise<import("./orders.service").OrderDetailWithListFlags[]>;
    listBranchDrivers(user: JwtUser): Promise<{
        id: string;
        fullName: string;
        username: string;
        branchName: string | null;
    }[]>;
    listCollectionsUnpaidOnline(branchId: string | undefined, user: JwtUser): Promise<{
        orderId: string;
        customerId: string;
        readableId: string;
        invoiceNumber: string | null;
        customerName: string;
        customerPhone: string;
        amountKd: string;
        paymentMethod: import("@prisma/client").PosPaymentMethod | null;
        paymentUrl: string | null;
        createdAtIso: string;
        invoiceAgeDays: number;
        reminderCount: number;
        lastReminderAtIso: string | null;
        canRemindNow: boolean;
        branchName: string | null;
        driverName: string | null;
        lineItems: {
            label: string | null;
            quantity: string;
            unitPriceKd: string;
            lineTotalKd: string;
        }[];
    }[]>;
    listStaleQuickOrderRisks(): Promise<{
        orderId: string;
        readableId: string;
        driverName: string;
        driverPhone: string | null;
        customerName: string;
        customerPhone: string;
        amountKd: string;
        paymentMethod: import("@prisma/client").PosPaymentMethod | null;
        ageHours: number;
        createdAtIso: string;
    }[]>;
    listDriverPendingInvoices(user: JwtUser): Promise<{
        orderId: string;
        readableId: string;
        invoiceNumber: string | null;
        customerName: string;
        customerPhone: string;
        amountKd: string;
        paymentMethod: import("@prisma/client").PosPaymentMethod | null;
        notes: string | null;
        orderStatus: import("@prisma/client").OrderStatus;
        linkStatus: "PENDING" | "EXPIRED" | null;
        createdAtIso: string;
    }[]>;
    mintInvoiceShareLink(id: string, user: JwtUser, req: Request): Promise<{
        token: string;
        shareUrl: string;
        pdfUrl?: string;
        expiresAtIso: string;
    }>;
    findOne(id: string, user: JwtUser): Promise<{
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
    assignDriver(id: string, dto: AssignDriverDto): Promise<{
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
    updateOrder(id: string, dto: UpdateOrderDto, user: JwtUser): Promise<{
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
