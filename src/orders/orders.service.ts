import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashStatus,
  OrderStatus,
  Prisma,
  SafariRole,
  ServiceType,
} from '@prisma/client';
import { CustomerLedgerService } from '../customer-ledger/customer-ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderQuickDto } from './dto/create-order-quick.dto';
import type { DriverContributionDto } from './dto/manager-dashboard.dto';
import type { OrderLineItemDto } from './dto/order-line-item.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { assertOrderStatusTransition } from './order-status.machine';
import { assertLineItemsMatchTotal } from './order-total.util';

const orderDetailSelect = {
  id: true,
  status: true,
  serviceType: true,
  totalPrice: true,
  cashStatus: true,
  walletSettledAt: true,
  invoiceNumber: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  customer: {
    select: {
      id: true,
      phone: true,
      phone2: true,
      address: true,
      displayName: true,
    },
  },
  driver: {
    select: {
      id: true,
      username: true,
      fullName: true,
      employeeId: true,
      jobTitle: true,
      phone: true,
      safariRole: true,
    },
  },
  lineItems: {
    select: {
      id: true,
      label: true,
      quantity: true,
      unitPrice: true,
    },
  },
} satisfies Prisma.OrderSelect;

export type OrderDetail = Prisma.OrderGetPayload<{
  select: typeof orderDetailSelect;
}>;

const terminalStatuses: OrderStatus[] = [
  OrderStatus.COMPLETED,
  OrderStatus.CANCELED,
];

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerLedger: CustomerLedgerService,
  ) {}

  private isManagerOrOwner(role: string): boolean {
    return role === SafariRole.OWNER || role === SafariRole.MANAGER;
  }

  private canViewAllOrders(role: string): boolean {
    return (
      this.isManagerOrOwner(role) ||
      role === SafariRole.CALL_CENTER ||
      role === SafariRole.ACCOUNTANT ||
      role === SafariRole.SUPERVISOR ||
      role === SafariRole.VIEWER
    );
  }

  /** Back-office roles that may change orders (excludes read-only accountant). */
  private canStaffUpdateOrders(role: string): boolean {
    return (
      this.isManagerOrOwner(role) || role === SafariRole.SUPERVISOR
    );
  }

  private async assertDriverUser(id: string): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u || u.safariRole !== SafariRole.DRIVER) {
      throw new ForbiddenException(
        'The assigned user must have the DRIVER role',
      );
    }
  }

  private reconcileLineItems(
    totalPrice: number,
    lineItems?: OrderLineItemDto[],
  ):
    | { label: string | null; quantity: number; unitPrice: number }[]
    | undefined {
    const items = lineItems ?? [];
    assertLineItemsMatchTotal(totalPrice, items);
    if (!items.length) {
      return undefined;
    }
    return items.map((line) => ({
      label: line.label?.trim() || null,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    }));
  }

  private async findCustomerByAnyPhone(
    tx: Prisma.TransactionClient,
    phoneCompact: string,
  ) {
    return tx.customer.findFirst({
      where: {
        OR: [{ phone: phoneCompact }, { phone2: phoneCompact }],
      },
    });
  }

  /** Driver-led capture: order is immediately owned by the creating driver. */
  async createQuick(
    driverUserId: string,
    dto: CreateOrderQuickDto,
  ): Promise<OrderDetail> {
    await this.assertDriverUser(driverUserId);
    const serviceType = dto.serviceType ?? ServiceType.NORMAL;
    const lineCreates = this.reconcileLineItems(dto.totalPrice, dto.lineItems);
    const phoneCompact = dto.customerPhone.replace(/[\s-]/g, '').trim();

    return this.prisma.$transaction(async (tx) => {
      let customerId: string;
      if (dto.customerId) {
        const existing = await tx.customer.findUnique({
          where: { id: dto.customerId },
        });
        if (!existing) {
          throw new NotFoundException('Customer not found');
        }
        const existingCompact = existing.phone.replace(/[\s-]/g, '').trim();
        const existingCompact2 = existing.phone2?.replace(/[\s-]/g, '').trim();
        if (existingCompact !== phoneCompact && existingCompact2 !== phoneCompact) {
          throw new BadRequestException(
            'customerPhone does not match the selected customer',
          );
        }
        customerId = existing.id;
        const name = dto.customerDisplayName?.trim();
        if (name) {
          await tx.customer.update({
            where: { id: customerId },
            data: { displayName: name },
          });
        }
      } else {
        const existingByPhone = await this.findCustomerByAnyPhone(
          tx,
          phoneCompact,
        );
        const customer =
          existingByPhone ?
            await tx.customer.update({
              where: { id: existingByPhone.id },
              data: {
                displayName:
                  dto.customerDisplayName?.trim() || existingByPhone.displayName,
                address: dto.customerAddress?.trim() || existingByPhone.address,
              },
            })
          : await tx.customer.create({
              data: {
                phone: phoneCompact,
                address: dto.customerAddress?.trim() || null,
                displayName: dto.customerDisplayName?.trim() || null,
              },
            });
        customerId = customer.id;
      }

      return tx.order.create({
        data: {
          customerId,
          driverId: driverUserId,
          serviceType,
          totalPrice: dto.totalPrice,
          status: OrderStatus.PENDING,
          invoiceNumber: dto.invoiceNumber?.trim() || null,
          notes: dto.notes?.trim() || null,
          ...(lineCreates?.length
            ? { lineItems: { create: lineCreates } }
            : {}),
        },
        select: orderDetailSelect,
      });
    });
  }

  /** Manager / owner intake — optional assignment to a driver. */
  async createAsManager(dto: CreateOrderDto): Promise<OrderDetail> {
    if (dto.driverId) {
      await this.assertDriverUser(dto.driverId);
    }
    const serviceType = dto.serviceType ?? ServiceType.NORMAL;
    const lineCreates = this.reconcileLineItems(dto.totalPrice, dto.lineItems);
    return this.prisma.$transaction(async (tx) => {
      const phoneCompact = dto.customerPhone.replace(/[\s-]/g, '').trim();
      const existingByPhone = await this.findCustomerByAnyPhone(tx, phoneCompact);
      const customer =
        existingByPhone ?
          await tx.customer.update({
            where: { id: existingByPhone.id },
            data: {
              address: dto.customerAddress?.trim() || existingByPhone.address,
            },
          })
        : await tx.customer.create({
            data: {
              phone: phoneCompact,
              address: dto.customerAddress?.trim() || null,
            },
          });
      return tx.order.create({
        data: {
          customerId: customer.id,
          driverId: dto.driverId ?? null,
          serviceType,
          totalPrice: dto.totalPrice,
          status: OrderStatus.PENDING,
          invoiceNumber: dto.invoiceNumber?.trim() || null,
          notes: dto.notes?.trim() || null,
          ...(lineCreates?.length
            ? { lineItems: { create: lineCreates } }
            : {}),
        },
        select: orderDetailSelect,
      });
    });
  }

  async findAllForActor(userId: string, role: string): Promise<OrderDetail[]> {
    if (this.canViewAllOrders(role)) {
      return this.prisma.order.findMany({
        select: orderDetailSelect,
        orderBy: { createdAt: 'desc' },
      });
    }
    if (role === SafariRole.DRIVER) {
      return this.prisma.order.findMany({
        where: { driverId: userId },
        select: orderDetailSelect,
        orderBy: { createdAt: 'desc' },
      });
    }
    return [];
  }

  async findOneForActor(
    id: string,
    userId: string,
    role: string,
  ): Promise<OrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: orderDetailSelect,
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (this.canViewAllOrders(role)) {
      return order;
    }
    if (role === SafariRole.DRIVER && order.driver?.id === userId) {
      return order;
    }
    throw new ForbiddenException('You cannot view this order');
  }

  async assignDriver(
    orderId: string,
    dto: AssignDriverDto,
  ): Promise<OrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (terminalStatuses.includes(order.status)) {
      throw new ForbiddenException(
        'Cannot assign a driver to a completed or canceled order',
      );
    }
    await this.assertDriverUser(dto.driverId);
    return this.prisma.order.update({
      where: { id: orderId },
      data: { driverId: dto.driverId },
      select: orderDetailSelect,
    });
  }

  async updateOrder(
    orderId: string,
    dto: UpdateOrderDto,
    userId: string,
    role: string,
  ): Promise<OrderDetail> {
    if (dto.status === undefined && dto.notes === undefined) {
      throw new BadRequestException('Send at least one of: status, notes');
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        driverId: true,
        status: true,
        cashStatus: true,
        walletSettledAt: true,
        customerId: true,
        totalPrice: true,
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (role === SafariRole.DRIVER) {
      if (order.driverId !== userId) {
        throw new ForbiddenException(
          'You may only update orders assigned to you',
        );
      }
    } else if (!this.canStaffUpdateOrders(role)) {
      throw new ForbiddenException('Your role cannot update orders');
    }
    if (dto.status !== undefined && dto.status !== order.status) {
      assertOrderStatusTransition(order.status, dto.status, !!order.driverId);
    }
    const willBeCompleted =
      dto.status !== undefined
        ? dto.status === OrderStatus.COMPLETED
        : order.status === OrderStatus.COMPLETED;

    const data: Prisma.OrderUpdateInput = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (
      dto.status === OrderStatus.COMPLETED &&
      dto.status !== order.status &&
      order.cashStatus === CashStatus.UNPAID
    ) {
      data.cashStatus = CashStatus.PAID_TO_DRIVER;
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data,
      });
      if (!order.walletSettledAt && willBeCompleted) {
        await this.customerLedger.applyOrderWalletSettlementForCompletedOrder(
          tx,
          orderId,
          userId,
        );
      }
      return tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: orderDetailSelect,
      });
    });
  }

  async getManagerDashboard(): Promise<{
    totalActiveOrders: number;
    revenueCompletedOrders: string;
    driverContribution: DriverContributionDto[];
  }> {
    const totalActiveOrders = await this.prisma.order.count({
      where: { status: { notIn: terminalStatuses } },
    });
    const agg = await this.prisma.order.aggregate({
      where: { status: OrderStatus.COMPLETED },
      _sum: { totalPrice: true },
    });
    const sum = agg._sum.totalPrice;

    const grouped = await this.prisma.order.groupBy({
      by: ['driverId'],
      where: {
        status: OrderStatus.COMPLETED,
        driverId: { not: null },
      },
      _count: true,
      _sum: { totalPrice: true },
    });

    const driverContribution: DriverContributionDto[] = [];
    for (const row of grouped) {
      if (!row.driverId) continue;
      const u = await this.prisma.user.findUnique({
        where: { id: row.driverId },
        select: { username: true, fullName: true, employeeId: true },
      });
      const rev = row._sum.totalPrice;
      driverContribution.push({
        driverId: row.driverId,
        employeeId: u?.employeeId ?? null,
        username: u?.username ?? '(unknown)',
        fullName: u?.fullName ?? '(unknown)',
        completedOrderCount: row._count,
        completedRevenue:
          rev !== null && rev !== undefined ? rev.toString() : '0',
      });
    }
    driverContribution.sort(
      (a, b) =>
        Number.parseFloat(b.completedRevenue) -
        Number.parseFloat(a.completedRevenue),
    );

    return {
      totalActiveOrders,
      revenueCompletedOrders:
        sum !== null && sum !== undefined ? sum.toString() : '0',
      driverContribution,
    };
  }
}
