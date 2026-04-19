import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashStatus,
  GeneralLedgerEntryType,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
  SafariRole,
  ServiceType,
} from '@prisma/client';
import type { CreatePaymentLinkResult } from '../common/services/payments.service';
import { PaymentsService } from '../common/services/payments.service';
import { CustomerNotificationsService } from '../customer-notifications/customer-notifications.service';
import { CustomerLedgerService } from '../customer-ledger/customer-ledger.service';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { parseFixed4ToMinor, toMinorFromFixed4 } from '../finance/finance-money';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { SerialCounterService } from '../serials/serial-counter.service';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderQuickDto } from './dto/create-order-quick.dto';
import { PosCheckoutBundleDto } from './dto/pos-checkout-bundle.dto';
import { PosCheckoutDto } from './dto/pos-checkout.dto';
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
  posPaymentMethod: true,
  completedAt: true,
  walletSettledAt: true,
  invoiceNumber: true,
  serialNumber: true,
  notes: true,
  reminderCount: true,
  lastReminderAt: true,
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
      starchOption: true,
      quantity: true,
      unitPrice: true,
    },
  },
} satisfies Prisma.OrderSelect;

export type OrderDetail = Prisma.OrderGetPayload<{
  select: typeof orderDetailSelect;
}>;

/** POS checkout may attach a hosted payment URL when using ONLINE. */
export type PosCheckoutOrderDetail = OrderDetail & {
  paymentLink?: CreatePaymentLinkResult;
};

/** Multi-invoice POS: one gateway session for several orders. */
export type PosCheckoutBundleResult = {
  bundleId: string;
  orders: OrderDetail[];
  paymentLink: CreatePaymentLinkResult;
};

const terminalStatuses: OrderStatus[] = [
  OrderStatus.COMPLETED,
  OrderStatus.CANCELED,
];

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerLedger: CustomerLedgerService,
    private readonly paymentsService: PaymentsService,
    private readonly customerNotifications: CustomerNotificationsService,
    private readonly generalLedger: GeneralLedgerService,
    private readonly serialCounter: SerialCounterService,
    private readonly inventory: InventoryService,
  ) {}

  private queuePosInvoiceNotify(
    detail: PosCheckoutOrderDetail,
    phoneCompact: string,
  ): void {
    const phone =
      detail.customer.phone?.trim() ||
      detail.customer.phone2?.trim() ||
      phoneCompact;
    const inv = detail.invoiceNumber?.trim() || `#${detail.id.slice(0, 8)}`;
    const amt = detail.totalPrice.toFixed(4);
    this.customerNotifications.notifyInvoiceIssued({
      customerPhone: phone,
      orderId: detail.id,
      invoiceLabel: inv,
      amountKd: amt,
      paymentUrl: detail.paymentLink?.url,
    });
  }

  private isManagerOrOwner(role: string): boolean {
    return (
      role === SafariRole.OWNER ||
      role === SafariRole.GENERAL_MANAGER ||
      role === SafariRole.MANAGER
    );
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

  /** Back-office roles that may change order status/notes (excludes owner read-only). */
  private canStaffUpdateOrders(role: string): boolean {
    return (
      role === SafariRole.MANAGER ||
      role === SafariRole.SUPERVISOR
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

  /** POS checkout actor: driver (field) or manager (in-store). */
  private async assertPosCheckoutActor(id: string): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (
      !u ||
      (u.safariRole !== SafariRole.DRIVER &&
        u.safariRole !== SafariRole.MANAGER)
    ) {
      throw new ForbiddenException(
        'POS checkout is only available to drivers and managers.',
      );
    }
  }

  /**
   * Wallet covers full total → SUBSCRIPTION_WALLET. Otherwise require external
   * settlement (CASH / KNET / PAYMENT_LINK / DEBT_ON_ACCOUNT).
   */
  /** Maps client input to DB enum values (PostgreSQL enum is UPPERCASE). */
  private resolvePosCheckoutPaymentMethod(
    shortfallMinor: bigint,
    raw: PosPaymentMethod | string | undefined,
  ): PosPaymentMethod {
    if (shortfallMinor === 0n) {
      return PosPaymentMethod.SUBSCRIPTION_WALLET;
    }
    const s = String(raw ?? 'CASH')
      .trim()
      .toUpperCase()
      .replace(/-/g, '_')
      .replace(/\s+/g, '');
    if (s === 'KNET') {
      return PosPaymentMethod.KNET;
    }
    if (
      s === 'ONLINE' ||
      s === 'PAYMENT_LINK' ||
      s === 'LINK' ||
      s === 'PAYMENTLINK'
    ) {
      return PosPaymentMethod.ONLINE;
    }
    if (
      s === 'DEBT_ON_ACCOUNT' ||
      s === 'ON_ACCOUNT' ||
      s === 'DEBT' ||
      s === 'CREDIT'
    ) {
      return PosPaymentMethod.DEBT_ON_ACCOUNT;
    }
    return PosPaymentMethod.CASH;
  }

  private reconcileLineItems(
    totalPrice: number,
    lineItems?: OrderLineItemDto[],
  ):
    | {
        label: string | null;
        quantity: number;
        unitPrice: number;
        stockItemId: string | null;
      }[]
    | undefined {
    const items = lineItems ?? [];
    assertLineItemsMatchTotal(totalPrice, items);
    if (!items.length) {
      return undefined;
    }
    return items.map((line) => ({
      label: line.label?.trim() || null,
      starchOption: line.starchOption ?? 'NONE',
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      stockItemId: line.stockItemId ?? null,
    }));
  }

  /**
   * POS checkout line rows — use plain numbers for Decimal columns (avoids nested
   * Prisma.Decimal create quirks on some drivers).
   */
  private mapPosCheckoutLineItems(
    lineItems?: OrderLineItemDto[],
  ):
    | {
        label: string | null;
        quantity: number;
        unitPrice: number;
        stockItemId: string | null;
      }[]
    | undefined {
    const items = lineItems ?? [];
    if (!items.length) {
      return undefined;
    }
    return items.map((line) => ({
      label: line.label?.trim() || null,
      starchOption: line.starchOption ?? 'NONE',
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      stockItemId: line.stockItemId ?? null,
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

  private async resolveQuickOrderCustomerId(
    tx: Prisma.TransactionClient,
    dto: CreateOrderQuickDto,
    phoneCompact: string,
  ): Promise<string> {
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
      const name = dto.customerDisplayName?.trim();
      if (name) {
        await tx.customer.update({
          where: { id: existing.id },
          data: { displayName: name },
        });
      }
      return existing.id;
    }
    const existingByPhone = await this.findCustomerByAnyPhone(tx, phoneCompact);
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
    return customer.id;
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
      const customerId = await this.resolveQuickOrderCustomerId(
        tx,
        dto,
        phoneCompact,
      );
      const serialNumber = await this.serialCounter.stampOrderSerial(
        tx,
        driverUserId,
      );
      return tx.order.create({
        data: {
          customerId,
          driverId: driverUserId,
          serviceType,
          totalPrice: dto.totalPrice,
          status: OrderStatus.PENDING,
          invoiceNumber: dto.invoiceNumber?.trim() || null,
          serialNumber,
          notes: dto.notes?.trim() || null,
          ...(lineCreates?.length
            ? { lineItems: { create: lineCreates } }
            : {}),
        },
        select: orderDetailSelect,
      });
    });
  }

  /**
   * POS checkout: create order, advance to COMPLETED, apply wallet settlement,
   * and record payment method for daily sales reporting.
   */
  async posCheckout(
    driverUserId: string,
    dto: PosCheckoutDto,
  ): Promise<PosCheckoutOrderDetail> {
    try {
      await this.assertPosCheckoutActor(driverUserId);
      if (!Number.isFinite(dto.totalPrice) || dto.totalPrice <= 0) {
        throw new BadRequestException(
          'totalPrice must be a finite positive number',
        );
      }

      const serviceType = dto.serviceType ?? ServiceType.NORMAL;
      const lineCreates = this.mapPosCheckoutLineItems(dto.lineItems);
      if (lineCreates) {
        for (const line of lineCreates) {
          // `unitPrice >= 0` (not `> 0`) so the POS engine can materialize
          // the zero-priced `DELIVERY_INSIDE_AREA` / free-tier surcharge
          // lines on attached invoices of the same collection trip.
          // Quantity must still be strictly positive — a 0-qty row is bogus.
          if (!(line.quantity > 0 && line.unitPrice >= 0)) {
            throw new BadRequestException(
              'Each line item must have a positive quantity and a non-negative unit price',
            );
          }
        }
      }
      const phoneCompact = dto.customerPhone.replace(/[\s-]/g, '').trim();

      const totalPriceNum = Number(dto.totalPrice);
      const totalPriceDecimal = new Prisma.Decimal(totalPriceNum.toFixed(4));

      const orderId = await this.prisma.$transaction(
        async (tx) => {
          const customerId = await this.resolveQuickOrderCustomerId(
            tx,
            dto,
            phoneCompact,
          );

          const walletRow = await tx.customerWallet.findUnique({
            where: { customerId },
          });
          const balanceMinor = walletRow
            ? toMinorFromFixed4(walletRow.balance)
            : 0n;
          const totalMinor = parseFixed4ToMinor(totalPriceDecimal.toFixed(4));
          const shortfallMinor =
            totalMinor > balanceMinor ? totalMinor - balanceMinor : 0n;

          const posPaymentMethodResolved = this.resolvePosCheckoutPaymentMethod(
            shortfallMinor,
            dto.posPaymentMethod,
          );

          const useHostedPaymentLink =
            shortfallMinor > 0n &&
            posPaymentMethodResolved === PosPaymentMethod.ONLINE;

          if (useHostedPaymentLink) {
            const serialNumber = await this.serialCounter.stampOrderSerial(
              tx,
              driverUserId,
            );
            const created = await tx.order.create({
              data: {
                customerId,
                driverId: driverUserId,
                serviceType,
                totalPrice: totalPriceDecimal,
                status: OrderStatus.PENDING,
                cashStatus: CashStatus.UNPAID,
                posPaymentMethod: PosPaymentMethod.ONLINE,
                completedAt: null,
                invoiceNumber: dto.invoiceNumber?.trim() || null,
                serialNumber,
                notes: dto.notes?.trim() || null,
                ...(lineCreates?.length
                  ? { lineItems: { create: lineCreates } }
                  : {}),
              },
              select: { id: true, driverId: true },
            });
            if (created.driverId !== driverUserId) {
              throw new ForbiddenException('Order must be assigned to you');
            }
            return created.id;
          }

          const completedAt = new Date();
          const serialNumber = await this.serialCounter.stampOrderSerial(
            tx,
            driverUserId,
          );

          const created = await tx.order.create({
            data: {
              customerId,
              driverId: driverUserId,
              serviceType,
              totalPrice: totalPriceDecimal,
              status: OrderStatus.COMPLETED,
              cashStatus: CashStatus.PAID_TO_DRIVER,
              posPaymentMethod: posPaymentMethodResolved,
              completedAt,
              invoiceNumber: dto.invoiceNumber?.trim() || null,
              serialNumber,
              notes: dto.notes?.trim() || null,
              ...(lineCreates?.length
                ? { lineItems: { create: lineCreates } }
                : {}),
            },
            select: { id: true, driverId: true },
          });
          if (created.driverId !== driverUserId) {
            throw new ForbiddenException('Order must be assigned to you');
          }

          await this.customerLedger.applyOrderWalletSettlementForCompletedOrder(
            tx,
            created.id,
            driverUserId,
            {
              customerId,
              totalPrice: totalPriceDecimal,
              posPaymentMethod: posPaymentMethodResolved,
              walletSettledAt: null,
              skipPerformerLookup: true,
            },
          );

          await this.generalLedger.append(tx, {
            entryType: GeneralLedgerEntryType.POS_SALE_COMPLETED,
            amount: totalPriceDecimal,
            memo: 'POS checkout',
            orderId: created.id,
            customerId,
            actorUserId: driverUserId,
            metadata: {
              posPaymentMethod: posPaymentMethodResolved,
            },
          });

          // Dastur §7 — POS → Inventory auto-decrement.
          // Resolves the driver's branch lazily inside the transaction
          // so POS keeps working for office users with no branch.
          const driverRow = await tx.user.findUnique({
            where: { id: driverUserId },
            select: { branchId: true },
          });
          await this.inventory.applyOrderStockDecrement(tx, {
            orderId: created.id,
            actorUserId: driverUserId,
            branchId: driverRow?.branchId ?? null,
            reference: `POS-${created.id.slice(0, 8)}`,
          });

          return created.id;
        },
        { maxWait: 10_000, timeout: 15_000 },
      );

      const detail = await this.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: orderDetailSelect,
      });

      if (
        detail.posPaymentMethod === PosPaymentMethod.ONLINE &&
        detail.status === OrderStatus.PENDING
      ) {
        const phone =
          detail.customer.phone?.trim() ||
          detail.customer.phone2?.trim() ||
          phoneCompact;
        const paymentLink = await this.paymentsService.createPaymentLink({
          orderId: detail.id,
          amount: detail.totalPrice,
          customerPhone: phone,
        });
        await this.prisma.order.update({
          where: { id: detail.id },
          data: { posHostedPaymentUrl: paymentLink.url },
        });
        const merged: PosCheckoutOrderDetail = { ...detail, paymentLink };
        this.queuePosInvoiceNotify(merged, phoneCompact);
        return merged;
      }

      this.queuePosInvoiceNotify(detail, phoneCompact);
      return detail;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.error(
          'POS_CHECKOUT_ERROR Prisma',
          error.code,
          error.meta,
          error.message,
        );
      } else {
        console.error('POS_CHECKOUT_ERROR:', error);
      }
      throw error;
    }
  }

  /**
   * POS multi-invoice: several orders, one hosted payment link for the sum.
   * Gateway callback uses the bundle id as `orderId`; all linked orders finalize together.
   */
  async posCheckoutBundle(
    driverUserId: string,
    dto: PosCheckoutBundleDto,
  ): Promise<PosCheckoutBundleResult> {
    await this.assertPosCheckoutActor(driverUserId);
    const serviceType = dto.serviceType ?? ServiceType.NORMAL;
    const phoneCompact = dto.customerPhone.replace(/[\s-]/g, '').trim();

    const prepared: Array<{
      totalPriceDecimal: Prisma.Decimal;
      lineCreates:
        | {
            label: string | null;
            quantity: number;
            unitPrice: number;
            stockItemId: string | null;
          }[]
        | undefined;
    }> = [];

    let sumDecimal = new Prisma.Decimal(0);

    for (const part of dto.orders) {
      if (!Number.isFinite(part.totalPrice) || part.totalPrice <= 0) {
        throw new BadRequestException(
          'Each sub-order must have a positive totalPrice',
        );
      }
      if (part.lineItems?.length) {
        assertLineItemsMatchTotal(part.totalPrice, part.lineItems);
      }
      const lineCreates = this.mapPosCheckoutLineItems(part.lineItems);
      if (lineCreates) {
        for (const line of lineCreates) {
          // See note in posCheckout above — `unitPrice >= 0` to admit the
          // free-tier `DELIVERY_INSIDE_AREA` line on attached invoices.
          if (!(line.quantity > 0 && line.unitPrice >= 0)) {
            throw new BadRequestException(
              'Each line item must have a positive quantity and a non-negative unit price',
            );
          }
        }
      }
      const td = new Prisma.Decimal(Number(part.totalPrice).toFixed(4));
      sumDecimal = sumDecimal.add(td);
      prepared.push({ totalPriceDecimal: td, lineCreates });
    }

    const customerDto = {
      customerPhone: dto.customerPhone,
      customerId: dto.customerId,
      customerDisplayName: dto.customerDisplayName,
      customerAddress: dto.customerAddress,
      totalPrice: dto.orders[0].totalPrice,
      lineItems: dto.orders[0].lineItems,
      serviceType: dto.serviceType,
    } as CreateOrderQuickDto;

    const bundleId = await this.prisma.$transaction(
      async (tx) => {
        const customerId = await this.resolveQuickOrderCustomerId(
          tx,
          customerDto,
          phoneCompact,
        );

        const bundle = await tx.posPaymentBundle.create({
          data: {
            driverId: driverUserId,
            totalAmountKd: sumDecimal,
          },
        });

        for (const p of prepared) {
          const serialNumber = await this.serialCounter.stampOrderSerial(
            tx,
            driverUserId,
          );
          const created = await tx.order.create({
            data: {
              customerId,
              driverId: driverUserId,
              serviceType,
              totalPrice: p.totalPriceDecimal,
              status: OrderStatus.PENDING,
              cashStatus: CashStatus.UNPAID,
              posPaymentMethod: PosPaymentMethod.ONLINE,
              completedAt: null,
              posPaymentBundleId: bundle.id,
              serialNumber,
              ...(p.lineCreates?.length ?
                { lineItems: { create: p.lineCreates } }
              : {}),
            },
            select: { id: true, driverId: true },
          });
          if (created.driverId !== driverUserId) {
            throw new ForbiddenException('Order must be assigned to you');
          }
        }

        return bundle.id;
      },
      { maxWait: 10_000, timeout: 15_000 },
    );

    const orders = await this.prisma.order.findMany({
      where: { posPaymentBundleId: bundleId },
      select: orderDetailSelect,
      orderBy: { createdAt: 'asc' },
    });

    if (orders.length === 0) {
      throw new BadRequestException('Bundle orders missing after checkout');
    }

    const phone =
      orders[0].customer.phone?.trim() ||
      orders[0].customer.phone2?.trim() ||
      phoneCompact;

    const paymentLink = await this.paymentsService.createPaymentLink({
      orderId: bundleId,
      amount: sumDecimal,
      customerPhone: phone,
    });

    await this.prisma.order.updateMany({
      where: { posPaymentBundleId: bundleId },
      data: { posHostedPaymentUrl: paymentLink.url },
    });

    const notifyBase = orders[0];
    const merged: PosCheckoutOrderDetail = {
      ...notifyBase,
      id: bundleId,
      totalPrice: sumDecimal,
      paymentLink,
    };
    this.queuePosInvoiceNotify(merged, phoneCompact);

    return { bundleId, orders, paymentLink };
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
      const serialNumber = await this.serialCounter.stampOrderSerial(
        tx,
        dto.driverId ?? null,
      );
      return tx.order.create({
        data: {
          customerId: customer.id,
          driverId: dto.driverId ?? null,
          serviceType,
          totalPrice: dto.totalPrice,
          status: OrderStatus.PENDING,
          invoiceNumber: dto.invoiceNumber?.trim() || null,
          serialNumber,
          notes: dto.notes?.trim() || null,
          ...(lineCreates?.length
            ? { lineItems: { create: lineCreates } }
            : {}),
        },
        select: orderDetailSelect,
      });
    });
  }

  /**
   * V1.5.6 — "Debt-Tracking Page" as a Financial Oversight Report.
   * V1.6.5 — adds optional `branchId` scoping, a human-readable
   * `readableId`, and 3-decimal KWD formatting (fils).
   *
   * Returns EVERY uncollected invoice regardless of payment method (Cash,
   * KNET, Payment Link, Online, Wallet, Debt-on-account). Filters:
   *
   *   cashStatus = UNPAID  AND  status != CANCELED
   *   AND (branch scope — see `orderBranchWhere` below)
   *
   * The sum of `amountKd` across the returned rows is the
   * "Market Debt Total" surfaced on the Collections KPI card — both
   * values are driven by the SAME predicate so they always match byte
   * for byte, including under a branch filter.
   *
   * `readableId` order of preference:
   *   1. `serialNumber`  — human-readable driver serial ("D2-1045")
   *   2. `invoiceNumber` — paper invoice reference
   *   3. last 6 chars of UUID, upper-cased — always present
   */
  async listUnpaidCollectionOrders(
    branchId: string | null = null,
  ): Promise<
    {
      orderId: string;
      readableId: string;
      invoiceNumber: string | null;
      customerName: string;
      customerPhone: string;
      amountKd: string;
      paymentMethod: PosPaymentMethod | null;
      paymentUrl: string | null;
      createdAtIso: string;
      invoiceAgeDays: number;
      reminderCount: number;
      lastReminderAtIso: string | null;
      canRemindNow: boolean;
      // V1.6.6 — raw line items for the WhatsApp template. Quantities
      // and unit prices are decimal strings (the Prisma convention on
      // this project); the frontend formats them for display.
      lineItems: {
        label: string | null;
        quantity: string;
        unitPriceKd: string;
        lineTotalKd: string;
      }[];
    }[]
  > {
    // Mirrors the helper in `call-center.service.ts` so the two islands
    // stay independent yet produce identical scoping. For driver-led
    // sales we match `driver.branchId`; for driver-less invoices (office
    // bookings, online prepaid, etc.) we fall back to the customer's
    // `originBranchId`. Omitting `branchId` yields the global view.
    const branchWhere: Prisma.OrderWhereInput | undefined = branchId
      ? {
          OR: [
            { driver: { is: { branchId } } },
            {
              driverId: null,
              customer: { is: { originBranchId: branchId } },
            },
          ],
        }
      : undefined;

    const rows = await this.prisma.order.findMany({
      where: {
        cashStatus: CashStatus.UNPAID,
        status: { not: OrderStatus.CANCELED },
        ...(branchWhere ?? {}),
      },
      select: {
        id: true,
        serialNumber: true,
        invoiceNumber: true,
        totalPrice: true,
        posPaymentMethod: true,
        posHostedPaymentUrl: true,
        createdAt: true,
        reminderCount: true,
        lastReminderAt: true,
        customer: {
          select: {
            displayName: true,
            phone: true,
            phone2: true,
          },
        },
        // V1.6.6 — line items feed the WhatsApp template's Items List.
        // Ordered by createdAt asc so the message renders in the same
        // sequence the driver/agent entered them at POS time.
        lineItems: {
          select: {
            label: true,
            quantity: true,
            unitPrice: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      // No `take:` — the KPI card is an unbounded aggregate of the same
      // predicate, so capping rows here would silently desync the
      // table-footer sum from the "Market Debt Total" card.
    });
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    // V1.6.8 — Collections recall window (must stay in sync with
    // `ORDER_REMINDER_COOLDOWN_MS` in call-center.service.ts). Drives
    // the `canRemindNow` flag that greys out the Send-payment-link
    // button on the table until 2.5 h after the last reminder.
    const ORDER_REMINDER_COOLDOWN_MS = 2.5 * 60 * 60 * 1000;
    return rows.map((r) => {
      const phone =
        r.customer.phone?.replace(/[\s-]/g, '').trim() ||
        r.customer.phone2?.replace(/[\s-]/g, '').trim() ||
        '';
      const name =
        r.customer.displayName?.trim() ||
        (phone ? phone : 'Customer');
      const ageMs = Math.max(0, now - r.createdAt.getTime());
      const invoiceAgeDays = Math.floor(ageMs / DAY_MS);
      const lastReminderMs = r.lastReminderAt?.getTime() ?? null;
      const canRemindNow =
        lastReminderMs === null ||
        now - lastReminderMs >= ORDER_REMINDER_COOLDOWN_MS;
      const readableId =
        r.serialNumber?.trim() ||
        r.invoiceNumber?.trim() ||
        `#${r.id.slice(-6).toUpperCase()}`;
      // V1.6.6 — line items serialized in 3dp KWD to match the rest of
      // the Collections island. `lineTotal = quantity * unitPrice` is
      // computed server-side so the frontend just pipes strings into
      // the WhatsApp template.
      const lineItems = r.lineItems.map((li) => {
        const lineTotal = li.quantity.mul(li.unitPrice);
        return {
          label: li.label,
          quantity: li.quantity.toString(),
          unitPriceKd: li.unitPrice.toFixed(3),
          lineTotalKd: lineTotal.toFixed(3),
        };
      });
      return {
        orderId: r.id,
        readableId,
        invoiceNumber: r.invoiceNumber ?? null,
        customerName: name,
        customerPhone: phone,
        // V1.6.5 — KWD standard uses 3 decimal places (fils). The Red-
        // card aggregate formats with the same precision so the table
        // footer equals the KPI to the last fils.
        amountKd: r.totalPrice.toFixed(3),
        paymentMethod: r.posPaymentMethod,
        paymentUrl: r.posHostedPaymentUrl ?? null,
        createdAtIso: r.createdAt.toISOString(),
        invoiceAgeDays,
        reminderCount: r.reminderCount,
        lastReminderAtIso: r.lastReminderAt
          ? r.lastReminderAt.toISOString()
          : null,
        canRemindNow,
        lineItems,
      };
    });
  }

  /**
   * @deprecated Use {@link listUnpaidCollectionOrders}. Retained as a
   * thin alias so that legacy callers (if any) keep compiling while
   * callers migrate to the widened, payment-method-agnostic query.
   */
  async listUnpaidOnlinePaymentOrders() {
    return this.listUnpaidCollectionOrders();
  }

  /**
   * V3.8 — Driver island: "Field Collection Tracker" (كشف المتابعة
   * الميدانية). READ-ONLY list of the driver's own unpaid invoices so
   * they can see what's still outstanding without ever crossing into
   * the Call Center's debt-recovery workflow.
   *
   * Scope:
   *   - `driverId === userId` (schema has no `createdById`; driver
   *     ownership of an Order is modeled on the `OrderDriver` relation
   *     and the existing `findAllForActor` uses the same field — see
   *     its JSDoc: "DRIVER: only orders assigned to them (including
   *     self-created)").
   *   - `cashStatus === UNPAID`
   *   - `status !== CANCELED` — canceled orders are not "pending".
   *
   * Sort: `createdAt DESC`.
   *
   * Status badge semantics — the UI renders two variants:
   *   - **Unpaid**           → `orderStatus` is upstream of COMPLETED
   *                            (driver hasn't delivered yet).
   *   - **Pending Approval** → `orderStatus === COMPLETED` but cash
   *                            hasn't been collected — the row is
   *                            waiting on Call Center / manager action.
   * The server returns both a machine-readable `orderStatus` and the
   * derived `pendingApproval` flag so the frontend never needs to know
   * the OrderStatus enum shape.
   *
   * Zero Call-Center interference: this endpoint does not read from
   * `TransactionHistory`, `PaymentLink` metadata, or the collections
   * aggregates — it is a pure `Order` projection.
   */
  async listDriverPendingInvoices(userId: string): Promise<
    {
      orderId: string;
      readableId: string;
      invoiceNumber: string | null;
      customerName: string;
      customerPhone: string;
      amountKd: string;
      paymentMethod: PosPaymentMethod | null;
      notes: string | null;
      orderStatus: OrderStatus;
      pendingApproval: boolean;
      createdAtIso: string;
    }[]
  > {
    const rows = await this.prisma.order.findMany({
      where: {
        driverId: userId,
        cashStatus: CashStatus.UNPAID,
        status: { not: OrderStatus.CANCELED },
      },
      select: {
        id: true,
        serialNumber: true,
        invoiceNumber: true,
        totalPrice: true,
        posPaymentMethod: true,
        status: true,
        notes: true,
        createdAt: true,
        customer: { select: { displayName: true, phone: true, phone2: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((r) => {
      const phone =
        r.customer.phone?.replace(/[\s-]/g, '').trim() ||
        r.customer.phone2?.replace(/[\s-]/g, '').trim() ||
        '';
      const name =
        r.customer.displayName?.trim() || (phone ? phone : 'Customer');
      const readableId =
        r.serialNumber?.trim() ||
        r.invoiceNumber?.trim() ||
        `#${r.id.slice(-6).toUpperCase()}`;
      return {
        orderId: r.id,
        readableId,
        invoiceNumber: r.invoiceNumber ?? null,
        customerName: name,
        customerPhone: phone,
        amountKd: r.totalPrice.toFixed(3),
        paymentMethod: r.posPaymentMethod,
        notes: r.notes?.trim() || null,
        orderStatus: r.status,
        pendingApproval: r.status === OrderStatus.COMPLETED,
        createdAtIso: r.createdAt.toISOString(),
      };
    });
  }

  /**
   * V1.5.6 — "Market Debt Total" used by Call Center KPI card.
   * Pure SUM over the same rows that feed the Debt-Tracking table so
   * the cell-sum and card-sum are identical by construction.
   */
  async sumUnpaidCollectionAmount(): Promise<Prisma.Decimal> {
    const agg = await this.prisma.order.aggregate({
      _sum: { totalPrice: true },
      where: {
        cashStatus: CashStatus.UNPAID,
        status: { not: OrderStatus.CANCELED },
      },
    });
    return agg._sum.totalPrice ?? new Prisma.Decimal(0);
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
    if (dto.status === OrderStatus.COMPLETED && dto.status !== order.status) {
      data.completedAt = new Date();
    }

    return this.prisma.$transaction(
      async (tx) => {
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
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
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
