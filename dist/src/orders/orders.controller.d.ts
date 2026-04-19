import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderQuickDto } from './dto/create-order-quick.dto';
import { ManagerDashboardDto } from './dto/manager-dashboard.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrdersService } from './orders.service';
export declare class OrdersController {
    private readonly ordersService;
    constructor(ordersService: OrdersService);
    getManagerDashboard(): Promise<ManagerDashboardDto>;
    createQuick(dto: CreateOrderQuickDto, user: JwtUser): Promise<{
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
        customer: {
            id: string;
            phone: string;
            phone2: string | null;
            displayName: string | null;
            address: string | null;
        };
        driver: {
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            phone: string | null;
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
    create(dto: CreateOrderDto): Promise<{
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
        customer: {
            id: string;
            phone: string;
            phone2: string | null;
            displayName: string | null;
            address: string | null;
        };
        driver: {
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            phone: string | null;
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
    findAll(user: JwtUser): Promise<{
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
        customer: {
            id: string;
            phone: string;
            phone2: string | null;
            displayName: string | null;
            address: string | null;
        };
        driver: {
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            phone: string | null;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        } | null;
        lineItems: {
            id: string;
            quantity: import("@prisma/client-runtime-utils").Decimal;
            label: string | null;
            starchOption: import("@prisma/client").$Enums.StarchOption;
            unitPrice: import("@prisma/client-runtime-utils").Decimal;
        }[];
    }[]>;
    listCollectionsUnpaidOnline(branchId?: string): Promise<{
        orderId: string;
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
        lineItems: {
            label: string | null;
            quantity: string;
            unitPriceKd: string;
            lineTotalKd: string;
        }[];
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
        pendingApproval: boolean;
        createdAtIso: string;
    }[]>;
    findOne(id: string, user: JwtUser): Promise<{
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
        customer: {
            id: string;
            phone: string;
            phone2: string | null;
            displayName: string | null;
            address: string | null;
        };
        driver: {
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            phone: string | null;
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
        customer: {
            id: string;
            phone: string;
            phone2: string | null;
            displayName: string | null;
            address: string | null;
        };
        driver: {
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            phone: string | null;
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
        customer: {
            id: string;
            phone: string;
            phone2: string | null;
            displayName: string | null;
            address: string | null;
        };
        driver: {
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            phone: string | null;
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
