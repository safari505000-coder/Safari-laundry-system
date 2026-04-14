import { Prisma } from '@prisma/client';
import { CustomerLedgerService } from '../customer-ledger/customer-ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderQuickDto } from './dto/create-order-quick.dto';
import { PosCheckoutDto } from './dto/pos-checkout.dto';
import type { DriverContributionDto } from './dto/manager-dashboard.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
declare const orderDetailSelect: {
    id: true;
    status: true;
    serviceType: true;
    totalPrice: true;
    cashStatus: true;
    posPaymentMethod: true;
    completedAt: true;
    walletSettledAt: true;
    invoiceNumber: true;
    notes: true;
    createdAt: true;
    updatedAt: true;
    customer: {
        select: {
            id: true;
            phone: true;
            phone2: true;
            address: true;
            displayName: true;
        };
    };
    driver: {
        select: {
            id: true;
            username: true;
            fullName: true;
            employeeId: true;
            jobTitle: true;
            phone: true;
            safariRole: true;
        };
    };
    lineItems: {
        select: {
            id: true;
            label: true;
            quantity: true;
            unitPrice: true;
        };
    };
};
export type OrderDetail = Prisma.OrderGetPayload<{
    select: typeof orderDetailSelect;
}>;
export declare class OrdersService {
    private readonly prisma;
    private readonly customerLedger;
    constructor(prisma: PrismaService, customerLedger: CustomerLedgerService);
    private isManagerOrOwner;
    private canViewAllOrders;
    private canStaffUpdateOrders;
    private assertDriverUser;
    private resolvePosCheckoutPaymentMethod;
    private reconcileLineItems;
    private mapPosCheckoutLineItems;
    private findCustomerByAnyPhone;
    private resolveQuickOrderCustomerId;
    createQuick(driverUserId: string, dto: CreateOrderQuickDto): Promise<OrderDetail>;
    posCheckout(driverUserId: string, dto: PosCheckoutDto): Promise<OrderDetail>;
    createAsManager(dto: CreateOrderDto): Promise<OrderDetail>;
    findAllForActor(userId: string, role: string): Promise<OrderDetail[]>;
    findOneForActor(id: string, userId: string, role: string): Promise<OrderDetail>;
    assignDriver(orderId: string, dto: AssignDriverDto): Promise<OrderDetail>;
    updateOrder(orderId: string, dto: UpdateOrderDto, userId: string, role: string): Promise<OrderDetail>;
    getManagerDashboard(): Promise<{
        totalActiveOrders: number;
        revenueCompletedOrders: string;
        driverContribution: DriverContributionDto[];
    }>;
}
export {};
