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
        customer: {
            id: string;
            phone: string;
            phone2: string | null;
            displayName: string | null;
            address: string | null;
        };
        status: import("@prisma/client").$Enums.OrderStatus;
        driver: {
            id: string;
            employeeId: string | null;
            username: string;
            fullName: string;
            phone: string | null;
            jobTitle: string | null;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        } | null;
        serviceType: import("@prisma/client").$Enums.ServiceType;
        totalPrice: import("@prisma/client-runtime-utils").Decimal;
        cashStatus: import("@prisma/client").$Enums.CashStatus;
        invoiceNumber: string | null;
        notes: string | null;
        walletSettledAt: Date | null;
        lineItems: {
            id: string;
            label: string | null;
            quantity: import("@prisma/client-runtime-utils").Decimal;
            unitPrice: import("@prisma/client-runtime-utils").Decimal;
        }[];
    }>;
    create(dto: CreateOrderDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        customer: {
            id: string;
            phone: string;
            phone2: string | null;
            displayName: string | null;
            address: string | null;
        };
        status: import("@prisma/client").$Enums.OrderStatus;
        driver: {
            id: string;
            employeeId: string | null;
            username: string;
            fullName: string;
            phone: string | null;
            jobTitle: string | null;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        } | null;
        serviceType: import("@prisma/client").$Enums.ServiceType;
        totalPrice: import("@prisma/client-runtime-utils").Decimal;
        cashStatus: import("@prisma/client").$Enums.CashStatus;
        invoiceNumber: string | null;
        notes: string | null;
        walletSettledAt: Date | null;
        lineItems: {
            id: string;
            label: string | null;
            quantity: import("@prisma/client-runtime-utils").Decimal;
            unitPrice: import("@prisma/client-runtime-utils").Decimal;
        }[];
    }>;
    findAll(user: JwtUser): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        customer: {
            id: string;
            phone: string;
            phone2: string | null;
            displayName: string | null;
            address: string | null;
        };
        status: import("@prisma/client").$Enums.OrderStatus;
        driver: {
            id: string;
            employeeId: string | null;
            username: string;
            fullName: string;
            phone: string | null;
            jobTitle: string | null;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        } | null;
        serviceType: import("@prisma/client").$Enums.ServiceType;
        totalPrice: import("@prisma/client-runtime-utils").Decimal;
        cashStatus: import("@prisma/client").$Enums.CashStatus;
        invoiceNumber: string | null;
        notes: string | null;
        walletSettledAt: Date | null;
        lineItems: {
            id: string;
            label: string | null;
            quantity: import("@prisma/client-runtime-utils").Decimal;
            unitPrice: import("@prisma/client-runtime-utils").Decimal;
        }[];
    }[]>;
    findOne(id: string, user: JwtUser): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        customer: {
            id: string;
            phone: string;
            phone2: string | null;
            displayName: string | null;
            address: string | null;
        };
        status: import("@prisma/client").$Enums.OrderStatus;
        driver: {
            id: string;
            employeeId: string | null;
            username: string;
            fullName: string;
            phone: string | null;
            jobTitle: string | null;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        } | null;
        serviceType: import("@prisma/client").$Enums.ServiceType;
        totalPrice: import("@prisma/client-runtime-utils").Decimal;
        cashStatus: import("@prisma/client").$Enums.CashStatus;
        invoiceNumber: string | null;
        notes: string | null;
        walletSettledAt: Date | null;
        lineItems: {
            id: string;
            label: string | null;
            quantity: import("@prisma/client-runtime-utils").Decimal;
            unitPrice: import("@prisma/client-runtime-utils").Decimal;
        }[];
    }>;
    assignDriver(id: string, dto: AssignDriverDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        customer: {
            id: string;
            phone: string;
            phone2: string | null;
            displayName: string | null;
            address: string | null;
        };
        status: import("@prisma/client").$Enums.OrderStatus;
        driver: {
            id: string;
            employeeId: string | null;
            username: string;
            fullName: string;
            phone: string | null;
            jobTitle: string | null;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        } | null;
        serviceType: import("@prisma/client").$Enums.ServiceType;
        totalPrice: import("@prisma/client-runtime-utils").Decimal;
        cashStatus: import("@prisma/client").$Enums.CashStatus;
        invoiceNumber: string | null;
        notes: string | null;
        walletSettledAt: Date | null;
        lineItems: {
            id: string;
            label: string | null;
            quantity: import("@prisma/client-runtime-utils").Decimal;
            unitPrice: import("@prisma/client-runtime-utils").Decimal;
        }[];
    }>;
    updateOrder(id: string, dto: UpdateOrderDto, user: JwtUser): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        customer: {
            id: string;
            phone: string;
            phone2: string | null;
            displayName: string | null;
            address: string | null;
        };
        status: import("@prisma/client").$Enums.OrderStatus;
        driver: {
            id: string;
            employeeId: string | null;
            username: string;
            fullName: string;
            phone: string | null;
            jobTitle: string | null;
            safariRole: import("@prisma/client").$Enums.SafariRole;
        } | null;
        serviceType: import("@prisma/client").$Enums.ServiceType;
        totalPrice: import("@prisma/client-runtime-utils").Decimal;
        cashStatus: import("@prisma/client").$Enums.CashStatus;
        invoiceNumber: string | null;
        notes: string | null;
        walletSettledAt: Date | null;
        lineItems: {
            id: string;
            label: string | null;
            quantity: import("@prisma/client-runtime-utils").Decimal;
            unitPrice: import("@prisma/client-runtime-utils").Decimal;
        }[];
    }>;
}
