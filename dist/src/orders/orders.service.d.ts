import { Prisma } from '@prisma/client';
import type { CreatePaymentLinkResult } from '../common/services/payments.service';
import { PaymentsService } from '../common/services/payments.service';
import { CustomerNotificationsService } from '../customer-notifications/customer-notifications.service';
import { CustomerLedgerService } from '../customer-ledger/customer-ledger.service';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderQuickDto } from './dto/create-order-quick.dto';
import { PosCheckoutBundleDto } from './dto/pos-checkout-bundle.dto';
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
            starchOption: true;
            quantity: true;
            unitPrice: true;
        };
    };
};
export type OrderDetail = Prisma.OrderGetPayload<{
    select: typeof orderDetailSelect;
}>;
export type PosCheckoutOrderDetail = OrderDetail & {
    paymentLink?: CreatePaymentLinkResult;
};
export type PosCheckoutBundleResult = {
    bundleId: string;
    orders: OrderDetail[];
    paymentLink: CreatePaymentLinkResult;
};
export declare class OrdersService {
    private readonly prisma;
    private readonly customerLedger;
    private readonly paymentsService;
    private readonly customerNotifications;
    private readonly generalLedger;
    constructor(prisma: PrismaService, customerLedger: CustomerLedgerService, paymentsService: PaymentsService, customerNotifications: CustomerNotificationsService, generalLedger: GeneralLedgerService);
    private queuePosInvoiceNotify;
    private isManagerOrOwner;
    private canViewAllOrders;
    private canStaffUpdateOrders;
    private assertDriverUser;
    private assertPosCheckoutActor;
    private resolvePosCheckoutPaymentMethod;
    private reconcileLineItems;
    private mapPosCheckoutLineItems;
    private findCustomerByAnyPhone;
    private resolveQuickOrderCustomerId;
    createQuick(driverUserId: string, dto: CreateOrderQuickDto): Promise<OrderDetail>;
    posCheckout(driverUserId: string, dto: PosCheckoutDto): Promise<PosCheckoutOrderDetail>;
    posCheckoutBundle(driverUserId: string, dto: PosCheckoutBundleDto): Promise<PosCheckoutBundleResult>;
    createAsManager(dto: CreateOrderDto): Promise<OrderDetail>;
    listUnpaidOnlinePaymentOrders(): Promise<{
        orderId: string;
        customerName: string;
        customerPhone: string;
        amountKd: string;
        paymentUrl: string;
    }[]>;
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
