import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  CashStatus,
  DebtSource,
  GeneralLedgerEntryType,
  InvoiceAuditAction,
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
import { cashStatusForPaymentMethod } from '../common/utils/cash-status-for-method';
import { resolveCustomerPhoneForNotify } from '../common/validation/kuwait-customer-phone';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { parseFixed4ToMinor, toMinorFromFixed4 } from '../finance/finance-money';
import { InventoryService } from '../inventory/inventory.service';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { assertUserNotOnAdministrativeBranchForSales } from '../branches/administrative-branch.util';
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
import { buildPublicInvoicePdfUrl } from './invoice-pdf.util';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'node:stream';

/**
 * V19.22.2 — Payment-link validity window (milliseconds).
 *
 * MUST stay in sync with
 * `PaymentsService.paymentLinkExpiryInMinutes` (see
 * `src/common/services/payments.service.ts`). UPayments enforces the
 * same ceiling, so the Field Collection Tracker's PENDING / EXPIRED
 * badges reflect what the gateway will actually accept.
 */
const PAYMENT_LINK_VALIDITY_HOURS = 24;
const PAYMENT_LINK_VALIDITY_MS = PAYMENT_LINK_VALIDITY_HOURS * 60 * 60 * 1000;

/**
 * V19.22.4 — Stale Quick-Capture threshold (milliseconds).
 *
 * Any Order that has been sitting in PENDING + UNPAID state longer
 * than this is surfaced to the Accountant as an
 * accountability risk. Consumed by
 * `OrdersService.listStaleQuickOrderRisks()` and the daily
 * `StaleQuickOrdersCron` audit job.
 */
export const STALE_QUICK_ORDER_THRESHOLD_HOURS = 24;
export const STALE_QUICK_ORDER_THRESHOLD_MS =
  STALE_QUICK_ORDER_THRESHOLD_HOURS * 60 * 60 * 1000;

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
      // V19.22 — surface outstanding wallet debt on invoice prints so the
      // customer (and driver handing over the receipt) immediately sees
      // any prior debt that is still owed. The print template hides the
      // line when debt is zero so zero-debt receipts keep the old layout.
      wallet: { select: { balance: true, debt: true } },
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
      // V19.9 — surface the issuing driver's branch so the Call-Center
      // "All Invoices" browser can render an aggregated table without
      // a secondary fetch. Any consumer that already destructures the
      // driver object is forward-compatible (extra property is
      // additive).
      branch: { select: { id: true, name: true } },
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

/** V19.26 — set on `GET /api/orders` when any supervisor EDIT row exists. */
export type OrderDetailWithListFlags = OrderDetail & {
  hasSupervisorEdit: boolean;
};

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
  private readonly log = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customerLedger: CustomerLedgerService,
    private readonly paymentsService: PaymentsService,
    private readonly customerNotifications: CustomerNotificationsService,
    private readonly generalLedger: GeneralLedgerService,
    private readonly serialCounter: SerialCounterService,
    private readonly inventory: InventoryService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * V19.25 — Mint public share + optional PDF for Moatmt. V19.27.1 — If
   * `PUBLIC_WEB_APP_URL` is missing but `PUBLIC_API_URL` (or payment callback
   * base) is set, we still mint JWT so `invoicePdfUrl` can be sent; web receipt
   * link is omitted in that case.
   */
  private async resolveInvoiceShareForNotify(
    orderId: string,
  ): Promise<{ shareUrl?: string; pdfUrl?: string } | undefined> {
    const webBase = process.env.PUBLIC_WEB_APP_URL?.trim().replace(/\/$/, '');
    const apiBase = (
      process.env.PUBLIC_API_URL?.trim() ||
      process.env.PAYMENTS_CALLBACK_PUBLIC_URL?.trim() ||
      ''
    ).replace(/\/$/, '');
    if (!webBase && !apiBase) {
      return undefined;
    }
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    if (!row) {
      return undefined;
    }
    const mintBase = webBase || apiBase;
    const minted = await this.mintInvoiceShareLink(orderId, mintBase);
    return {
      shareUrl: webBase ? minted.shareUrl : undefined,
      pdfUrl: minted.pdfUrl,
    };
  }

  /**
   * Sends invoice + payment/receipt text to the customer (webhook if configured).
   * Call with `void …catch` for non-**ONLINE** checkouts; **await** for ONLINE
   * so the UPayments link + receipt text is delivered before the HTTP response
   * returns to the POS.
   */
  /**
   * V19.27.5 — Text block for customer WhatsApp: line labels + qty × price (3dp KWD).
   */
  private formatLineItemsBlockForNotify(detail: OrderDetail): string {
    if (!detail.lineItems?.length) {
      return '';
    }
    const out: string[] = [];
    for (const li of detail.lineItems) {
      const qty = Number(li.quantity);
      const unit = Number(li.unitPrice);
      const sub = (qty * unit).toFixed(3);
      const label = (li.label ?? '—').replace(/\s+/g, ' ').trim();
      out.push(
        `• ${label} — العدد ${String(qty)} × ${unit.toFixed(3)} = ${sub} د.ك`,
      );
    }
    return out.join('\n');
  }

  private formatLineItemsBlockForBundleNotify(orders: OrderDetail[]): string {
    if (orders.length === 0) {
      return '';
    }
    if (orders.length === 1) {
      return this.formatLineItemsBlockForNotify(orders[0]!);
    }
    const parts: string[] = [];
    for (const o of orders) {
      const lab = this.invoiceLabelForCustomerNotify(o);
      const block = this.formatLineItemsBlockForNotify(o);
      parts.push(`━━ ${lab} ━━`, block || '—');
    }
    return parts.join('\n\n');
  }

  /**
   * V19.27.6 — تسلسل السائق (serialNumber، مثلاً D2-1045) كما في الإعدادات/الطابعة
   * على الفاتورة؛ إن وُجد يُستَخدَم لنص واتساب، ثم رقم الورقي، ثم مُختصَر id.
   */
  private invoiceLabelForCustomerNotify(order: OrderDetail): string {
    return (
      order.serialNumber?.trim() ||
      order.invoiceNumber?.trim() ||
      `#${order.id.slice(0, 8)}`
    );
  }

  private async posInvoiceNotifyToCustomer(
    detail: PosCheckoutOrderDetail,
    phoneCompact: string,
  ): Promise<void> {
    const phone = resolveCustomerPhoneForNotify(
      detail.customer.phone,
      detail.customer.phone2,
      phoneCompact,
    );
    const inv = this.invoiceLabelForCustomerNotify(detail);
    const amt = detail.totalPrice.toFixed(3);
    const lineItemsSummary = this.formatLineItemsBlockForNotify(detail);
    await this.customerNotifications.deliverInvoiceIssuedNow({
      customerPhone: phone,
      orderId: detail.id,
      invoiceLabel: inv,
      amountKd: amt,
      paymentUrl: detail.paymentLink?.url,
      lineItemsSummary: lineItemsSummary || undefined,
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
      role === SafariRole.CALL_CENTER_SUPERVISOR ||
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
    await assertUserNotOnAdministrativeBranchForSales(
      this.prisma,
      driverUserId,
    );
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
      // V19.22.4 — Normalize the declared payment method. Quick
      // capture is "I'll settle this through channel X later" — not
      // "cash has already been received". So the cashStatus stays
      // UNPAID at creation; the actual settlement flips it via
      // POS checkout (or a subsequent status transition to
      // COMPLETED that auto-invokes `cashStatusForPaymentMethod`).
      const posPaymentMethodNormalized =
        dto.posPaymentMethod === PosPaymentMethod.PAYMENT_LINK
          ? PosPaymentMethod.ONLINE
          : dto.posPaymentMethod;

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
          posPaymentMethod: posPaymentMethodNormalized,
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
      if (driverUserId == null || String(driverUserId).trim() === '') {
        throw new BadRequestException(
          'posCheckout: missing driver/manager id from session',
        );
      }
      await this.assertPosCheckoutActor(driverUserId);
      await assertUserNotOnAdministrativeBranchForSales(
        this.prisma,
        driverUserId,
      );
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
            if (created == null) {
              throw new InternalServerErrorException(
                'posCheckout: order.create (ONLINE) returned no row — check DB and line items',
              );
            }
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
              // V19.11.3 — KNET and other electronic methods go straight
              // to PAID_ONLINE so they never appear in driver-cash trails.
              cashStatus: cashStatusForPaymentMethod(posPaymentMethodResolved),
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
          if (created == null) {
            throw new InternalServerErrorException(
              'posCheckout: order.create (completed) returned no row — check DB and line items',
            );
          }
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
        const phone = resolveCustomerPhoneForNotify(
          detail.customer.phone,
          detail.customer.phone2,
          phoneCompact,
        );
        const paymentLink = await this.paymentsService.createPaymentLink({
          orderId: detail.id,
          amount: detail.totalPrice,
          customerPhone: phone,
        });
        await this.prisma.order.update({
          where: { id: detail.id },
          data: {
            posHostedPaymentUrl: paymentLink.url,
            posGatewayTrackId: paymentLink.trackId ?? null,
            posGatewayMetadata: {
              charge: {
                provider: 'upayments',
                trackId: paymentLink.trackId ?? null,
                link: paymentLink.url,
                createdAt: new Date().toISOString(),
                source: 'posCheckout',
              },
            } as Prisma.InputJsonValue,
          },
        });
        const merged: PosCheckoutOrderDetail = { ...detail, paymentLink };
        await this.posInvoiceNotifyToCustomer(merged, phoneCompact);
        await this.prisma.order.update({
          where: { id: detail.id },
          data: { ccCollectionPaymentWaLocked: true },
        });
        return merged;
      }

      void this.posInvoiceNotifyToCustomer(detail, phoneCompact).catch((e) =>
        this.log.warn(`pos invoice notify: ${e}`),
      );
      // Same thank-you + rating link as gateway / CC mark-paid (field cash & KNET included).
      this.paymentsService.schedulePaymentConfirmedCustomerNotify(detail.id);
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
    if (driverUserId == null || String(driverUserId).trim() === '') {
      throw new BadRequestException(
        'posCheckoutBundle: missing driver/manager id from session',
      );
    }
    await this.assertPosCheckoutActor(driverUserId);
    await assertUserNotOnAdministrativeBranchForSales(
      this.prisma,
      driverUserId,
    );
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
          if (created == null) {
            throw new InternalServerErrorException(
              'posCheckoutBundle: order.create returned no row — check DB and line items',
            );
          }
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

    const phone = resolveCustomerPhoneForNotify(
      orders[0].customer.phone,
      orders[0].customer.phone2,
      phoneCompact,
    );

    const paymentLink = await this.paymentsService.createPaymentLink({
      orderId: bundleId,
      amount: sumDecimal,
      customerPhone: phone,
    });

    await this.prisma.order.updateMany({
      where: { posPaymentBundleId: bundleId },
      data: {
        posHostedPaymentUrl: paymentLink.url,
        posGatewayTrackId: paymentLink.trackId ?? null,
        posGatewayMetadata: {
          charge: {
            provider: 'upayments',
            trackId: paymentLink.trackId ?? null,
            link: paymentLink.url,
            createdAt: new Date().toISOString(),
            source: 'posCheckoutBundle',
          },
        } as Prisma.InputJsonValue,
      },
    });

    {
      const first = orders[0]!;
      const lineItemsSummary = this.formatLineItemsBlockForBundleNotify(orders);
      await this.customerNotifications.deliverInvoiceIssuedNow({
        customerPhone: phone,
        orderId: first.id,
        invoiceLabel:
          orders.length > 1 ?
            `مجموعة ${orders.length} فواتير`
          : this.invoiceLabelForCustomerNotify(first),
        amountKd: sumDecimal.toFixed(3),
        paymentUrl: paymentLink.url,
        lineItemsSummary: lineItemsSummary || undefined,
      });
    }
    await this.prisma.order.updateMany({
      where: { posPaymentBundleId: bundleId },
      data: { ccCollectionPaymentWaLocked: true },
    });

    return { bundleId, orders, paymentLink };
  }

  /** Manager / owner intake — optional assignment to a driver. */
  async createAsManager(
    dto: CreateOrderDto,
    managerUserId: string,
  ): Promise<OrderDetail> {
    await assertUserNotOnAdministrativeBranchForSales(
      this.prisma,
      managerUserId,
    );
    if (dto.driverId) {
      await this.assertDriverUser(dto.driverId);
      await assertUserNotOnAdministrativeBranchForSales(
        this.prisma,
        dto.driverId,
      );
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
    actor?: JwtUser,
  ): Promise<
    {
      orderId: string;
      customerId: string;
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
      /** True when field (driver/manager) already sent payment link — CC agents must not duplicate WhatsApp. */
      ccCollectionPaymentWaLocked: boolean;
      /** For CC: false when `ccCollectionPaymentWaLocked`; other roles ignore the lock. */
      canSendCollectionPaymentWa: boolean;
      // V19.4 — CC pack #5. Contextual identity for the WhatsApp
      // template + CC dashboard: which branch the sale came from and
      // which driver handled the delivery. Nullable because legacy
      // office bookings may lack a driver, and customers created
      // before origin-branch tracking may lack a branch.
      branchName: string | null;
      driverName: string | null;
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
    const isDriver = actor?.role === SafariRole.DRIVER;
    const effectiveBranchId =
      isDriver ? null
      : branchId ??
        (actor?.role === SafariRole.MANAGER && actor.branchId ?
          actor.branchId
        : null);

    const branchWhere: Prisma.OrderWhereInput | undefined = isDriver
      ? { driverId: actor!.userId }
      : effectiveBranchId
        ? {
            OR: [
              { driver: { is: { branchId: effectiveBranchId } } },
              {
                driverId: null,
                customer: { is: { originBranchId: effectiveBranchId } },
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
        customerId: true,
        serialNumber: true,
        invoiceNumber: true,
        totalPrice: true,
        posPaymentMethod: true,
        posHostedPaymentUrl: true,
        createdAt: true,
        reminderCount: true,
        lastReminderAt: true,
        ccCollectionPaymentWaLocked: true,
        customer: {
          select: {
            id: true,
            displayName: true,
            phone: true,
            phone2: true,
            originBranch: { select: { name: true } },
          },
        },
        // V19.4 — CC pack #5. Driver + branch identity for the
        // WhatsApp template and the debt dashboard. Prefer the
        // driver's own branch; fall back to the customer's origin
        // branch when the invoice was created without a driver.
        driver: {
          select: {
            fullName: true,
            branch: { select: { name: true } },
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
      const ccLocked = r.ccCollectionPaymentWaLocked;
      const isCcOnly =
        actor?.role === SafariRole.CALL_CENTER ||
        actor?.role === SafariRole.CALL_CENTER_SUPERVISOR;
      const canSendCollectionPaymentWa =
        canRemindNow && !(ccLocked && isCcOnly);
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
      // V19.4 — CC pack #5. Driver's branch is authoritative; fall
      // back to the customer's origin branch for driver-less (office
      // booking / online prepaid) orders.
      const branchName =
        r.driver?.branch?.name?.trim() ||
        r.customer.originBranch?.name?.trim() ||
        null;
      const driverName = r.driver?.fullName?.trim() || null;
      return {
        orderId: r.id,
        customerId: r.customerId,
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
        ccCollectionPaymentWaLocked: ccLocked,
        canSendCollectionPaymentWa,
        branchName,
        driverName,
        lineItems,
      };
    });
  }

  /**
   * Single unpaid row for server-side payment-link WhatsApp (Moatmt / webhook),
   * using the same projection as {@link listUnpaidCollectionOrders}.
   */
  async getUnpaidCollectionOrderRowForWhatsappText(
    orderId: string,
  ): Promise<{
    orderId: string;
    readableId: string;
    invoiceNumber: string | null;
    customerName: string;
    /** Compact digits — same as collections list `customerPhone`. */
    customerPhone: string;
    customerPhone2: string | null;
    amountKd: string;
    lineItems: {
      label: string | null;
      quantity: string;
      lineTotalKd: string;
    }[];
    branchName: string | null;
    driverName: string | null;
  } | null> {
    const r = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        cashStatus: CashStatus.UNPAID,
        status: { not: OrderStatus.CANCELED },
      },
      select: {
        id: true,
        serialNumber: true,
        invoiceNumber: true,
        totalPrice: true,
        customer: {
          select: {
            displayName: true,
            phone: true,
            phone2: true,
            originBranch: { select: { name: true } },
          },
        },
        driver: {
          select: {
            fullName: true,
            branch: { select: { name: true } },
          },
        },
        lineItems: {
          select: {
            label: true,
            quantity: true,
            unitPrice: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!r) {
      return null;
    }
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
    const lineItems = r.lineItems.map((li) => {
      const lineTotal = li.quantity.mul(li.unitPrice);
      return {
        label: li.label,
        quantity: li.quantity.toString(),
        lineTotalKd: lineTotal.toFixed(3),
      };
    });
    const branchName =
      r.driver?.branch?.name?.trim() ||
      r.customer.originBranch?.name?.trim() ||
      null;
    const driverName = r.driver?.fullName?.trim() || null;
    return {
      orderId: r.id,
      readableId,
      invoiceNumber: r.invoiceNumber ?? null,
      customerName: name,
      customerPhone: phone,
      customerPhone2:
        r.customer.phone2?.replace(/[\s-]/g, '').trim() || null,
      amountKd: r.totalPrice.toFixed(3),
      lineItems,
      branchName,
      driverName,
    };
  }

  /**
   * @deprecated Use {@link listUnpaidCollectionOrders}. Retained as a
   * thin alias so that legacy callers (if any) keep compiling while
   * callers migrate to the widened, payment-method-agnostic query.
   */
  async listUnpaidOnlinePaymentOrders() {
    return this.listUnpaidCollectionOrders(null, undefined);
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
   *   - `cashStatus === UNPAID` (pending hosted payment link) OR
   *     `posPaymentMethod === DEBT_ON_ACCOUNT` AND the ledger's FIFO
   *     allocation shows the invoice still has open debt. Debt invoices
   *     stay `cashStatus = PAID_TO_DRIVER` because the driver signed for
   *     the paper trail; the field-tracker is the only surface that
   *     reunites "pending link" + "open debt" for the driver in one view
   *     and drops invoices the instant the customer settles through ANY
   *     channel (hosted link, CC partial payment, office cash recorded
   *     by the Accountant). See {@link resolveOpenDebtOrderIds}.
   *   - `status !== CANCELED` — canceled orders are not "pending".
   *
   * Sort: `createdAt DESC`.
   *
   * Status badge semantics — the UI renders only two variants
   * (V19.22.3, simplified by the Owner):
   *   - **Pending payment** (blue) → a hosted payment-link is live
   *     and the customer can still pay within the 24h validity
   *     window (`linkStatus === 'PENDING'`).
   *   - **Unpaid**          (red)  → everything else. Debt-on-account
   *     invoices, expired links, and classic cash-arrears all show
   *     the SAME red badge because the real-world action is
   *     identical: the driver (or Call Center) chases the cash, and
   *     the Call Center manually converts any collected cash to
   *     CASH in the POS when it arrives.
   *
   * The previous "Pending Approval" badge was removed — it misled
   * the driver into thinking someone else was about to close the
   * row automatically. In practice, nobody "approves" a debt until
   * the customer actually pays.
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
      /**
       * V19.22.2 — Payment-link lifecycle for the Field Collection
       * Tracker badges:
       *   - 'PENDING'  → link was issued and is still within its
       *     24-hour validity window (customer can still pay).
       *   - 'EXPIRED'  → link was issued but the 24h window elapsed
       *     without payment (driver must chase the customer again).
       *   - null       → this row is not a payment-link invoice
       *     (CASH / KNET / DEBT_ON_ACCOUNT are represented by the
       *     default Unpaid badge).
       * Validity mirrors
       * `PaymentsService.paymentLinkExpiryInMinutes` so the
       * server-side promise matches what UPayments actually enforces.
       */
      linkStatus: 'PENDING' | 'EXPIRED' | null;
      createdAtIso: string;
    }[]
  > {
    const rows = await this.prisma.order.findMany({
      where: {
        driverId: userId,
        status: { not: OrderStatus.CANCELED },
        OR: [
          { cashStatus: CashStatus.UNPAID },
          { posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT },
        ],
      },
      select: {
        id: true,
        serialNumber: true,
        invoiceNumber: true,
        totalPrice: true,
        posPaymentMethod: true,
        cashStatus: true,
        status: true,
        notes: true,
        createdAt: true,
        customerId: true,
        posHostedPaymentUrl: true,
        customer: { select: { displayName: true, phone: true, phone2: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // V1.6.10 — DEBT_ON_ACCOUNT invoices must disappear from the driver's
    // tracker once the customer settles the debt (through any channel:
    // hosted payment link, office cash recorded by accountant, CC partial
    // debt payment, etc.). We reuse the Accountant-canonical FIFO
    // allocation from DebtService: per-customer, oldest-first, with
    // per-order direct PAYMENTs + a FIFO share of customer-level
    // (orderId=null) PAYMENTs. An invoice is "still open" iff its FIFO
    // share of the customer's remaining unallocated debt is > 0 fils.
    // The UNPAID-cashStatus branch (pending hosted link) is always kept
    // regardless of ledger state because its own settlement flips the
    // cashStatus back to PAID_ONLINE at the gateway callback.
    const debtCandidates = rows.filter(
      (r) => r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT,
    );
    const openDebtOrderIds = await this.resolveOpenDebtOrderIds(
      debtCandidates.map((r) => ({ orderId: r.id, customerId: r.customerId })),
    );

    const filtered = rows.filter((r) => {
      if (r.cashStatus === CashStatus.UNPAID) return true;
      if (r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT) {
        return openDebtOrderIds.has(r.id);
      }
      return false;
    });

    const now = Date.now();
    return filtered.map((r) => {
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

      // V19.22.2 — payment-link lifecycle (24h validity).
      // An "ONLINE" order that still has an UNPAID cashStatus and a
      // stored hosted-link URL is either still actionable by the
      // customer (PENDING) or past its window (EXPIRED). For rows
      // without a hosted link URL (pure CASH / KNET / DEBT_ON_ACCOUNT)
      // we leave linkStatus null — the UI falls back to the classic
      // Unpaid / Pending-Approval badges.
      let linkStatus: 'PENDING' | 'EXPIRED' | null = null;
      if (
        r.posPaymentMethod === PosPaymentMethod.ONLINE &&
        r.cashStatus === CashStatus.UNPAID &&
        typeof r.posHostedPaymentUrl === 'string' &&
        r.posHostedPaymentUrl.length > 0
      ) {
        const ageMs = now - r.createdAt.getTime();
        linkStatus =
          ageMs <= PAYMENT_LINK_VALIDITY_MS ? 'PENDING' : 'EXPIRED';
      }

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
        linkStatus,
        createdAtIso: r.createdAt.toISOString(),
      };
    });
  }

  /**
   * V19.22.5 — Drivers dropdown source for the Invoices-page filter.
   *
   * MANAGER: only drivers attached to their own branch.
   * OWNER / GM / ACCOUNTANT / CC: every DRIVER-role user in the
   * system (status != RESIGNED) so they can filter the full fleet.
   *
   * DRIVER: not called (the Invoices page for the driver island
   * doesn't expose a driver filter — drivers see their own rows).
   */
  async listInvoiceFilterDrivers(
    role: string,
    branchId: string | null,
  ): Promise<
    { id: string; fullName: string; username: string; branchName: string | null }[]
  > {
    const where: Prisma.UserWhereInput = {
      role: { name: SafariRole.DRIVER },
      isActive: true,
    };
    if (role === SafariRole.MANAGER) {
      if (!branchId) return [];
      where.branchId = branchId;
    }
    const rows = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        username: true,
        branch: { select: { name: true } },
      },
      orderBy: { fullName: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      username: r.username,
      branchName: r.branch?.name ?? null,
    }));
  }

  /**
   * V19.22.4 — Stale quick-capture watchdog for the Accountant.
   *
   * Lists every Order that was created via the driver's Quick Capture
   * flow (`POST /orders/quick`) and has been sitting in PENDING +
   * UNPAID state for longer than 24 hours. These rows are the
   * highest-risk accountability bucket in the system:
   *
   *   • The paper trail proves an invoice was "issued" (serialNumber
   *     was stamped by SerialCounter → permanent, unique).
   *   • The customer may already have handed cash to the driver.
   *   • But POS checkout was never completed, so the ledger has
   *     zero record of the cash receiving.
   *
   * Running the watchdog daily (via `StaleQuickOrdersCron`) + exposing
   * this read endpoint on the Accountant dashboard closes the loop:
   * the Accountant sees exactly which driver has dangling invoices
   * and can call them to settle the same day.
   *
   * Returns oldest-first so the most overdue rows surface at the top.
   * Amounts are serialized to KWD 3-decimal (fils) strings.
   */
  async listStaleQuickOrderRisks(): Promise<
    {
      orderId: string;
      readableId: string;
      driverName: string;
      driverPhone: string | null;
      customerName: string;
      customerPhone: string;
      amountKd: string;
      paymentMethod: PosPaymentMethod | null;
      ageHours: number;
      createdAtIso: string;
    }[]
  > {
    const cutoff = new Date(Date.now() - STALE_QUICK_ORDER_THRESHOLD_MS);
    const rows = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        cashStatus: CashStatus.UNPAID,
        createdAt: { lt: cutoff },
        driverId: { not: null },
      },
      select: {
        id: true,
        serialNumber: true,
        invoiceNumber: true,
        totalPrice: true,
        posPaymentMethod: true,
        createdAt: true,
        driver: {
          select: { id: true, fullName: true, phone: true },
        },
        customer: {
          select: { displayName: true, phone: true, phone2: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const now = Date.now();
    return rows.map((r) => {
      const phone =
        r.customer.phone?.replace(/[\s-]/g, '').trim() ||
        r.customer.phone2?.replace(/[\s-]/g, '').trim() ||
        '';
      const customerName =
        r.customer.displayName?.trim() || (phone ? phone : 'Customer');
      const driverName = r.driver?.fullName?.trim() || '—';
      const readableId =
        r.serialNumber?.trim() ||
        r.invoiceNumber?.trim() ||
        `#${r.id.slice(-6).toUpperCase()}`;
      const ageHours = Math.round(
        (now - r.createdAt.getTime()) / (60 * 60 * 1000),
      );
      return {
        orderId: r.id,
        readableId,
        driverName,
        driverPhone: r.driver?.phone ?? null,
        customerName,
        customerPhone: phone,
        amountKd: r.totalPrice.toFixed(3),
        paymentMethod: r.posPaymentMethod,
        ageHours,
        createdAtIso: r.createdAt.toISOString(),
      };
    });
  }

  /**
   * Given a set of candidate `(orderId, customerId)` tuples representing
   * DEBT_ON_ACCOUNT orders, return the subset of orderIds that are STILL
   * open after FIFO-allocating the customer's payments across ALL of
   * their SHORTFALL invoices (not just the ones in the candidate list).
   *
   * Used by the Driver Field Collection Tracker so settled debts vanish
   * from the driver's list the moment the ledger says the customer is
   * current. The algorithm mirrors
   * `DebtService.getUnpaidInvoices()` (the Accountant's canonical source
   * of truth) to guarantee both surfaces agree on "is this invoice still
   * open?" without physically sharing code paths.
   */
  private async resolveOpenDebtOrderIds(
    candidates: { orderId: string; customerId: string }[],
  ): Promise<Set<string>> {
    const openIds = new Set<string>();
    if (candidates.length === 0) return openIds;

    const customerIds = Array.from(
      new Set(candidates.map((c) => c.customerId)),
    );

    // 1) Every SHORTFALL entry for the affected customers — we need the
    //    FULL picture (other drivers' invoices too) so FIFO allocation
    //    applies to the correct oldest-first order across all of them.
    const shortfallEntries = await this.prisma.debtLedgerEntry.findMany({
      where: {
        source: DebtSource.INVOICE_SHORTFALL,
        customerId: { in: customerIds },
        orderId: { not: null },
      },
      select: {
        orderId: true,
        customerId: true,
        amount: true,
        order: {
          select: { id: true, createdAt: true, completedAt: true },
        },
      },
    });

    type Agg = {
      orderId: string;
      customerId: string;
      issuedAt: Date;
      shortfall: number;
      paid: number;
    };
    const perOrder = new Map<string, Agg>();
    for (const e of shortfallEntries) {
      if (!e.orderId || !e.order) continue;
      const amount = Number.parseFloat(e.amount.toString());
      if (!Number.isFinite(amount)) continue;
      const cur = perOrder.get(e.orderId);
      if (cur) {
        cur.shortfall += amount;
      } else {
        perOrder.set(e.orderId, {
          orderId: e.orderId,
          customerId: e.customerId,
          issuedAt: e.order.completedAt ?? e.order.createdAt,
          shortfall: amount,
          paid: 0,
        });
      }
    }

    const allOrderIds = Array.from(perOrder.keys());
    if (allOrderIds.length === 0) return openIds;

    // 2) Per-order direct PAYMENTs.
    const perOrderPayments = await this.prisma.debtLedgerEntry.groupBy({
      by: ['orderId'],
      where: {
        source: DebtSource.PAYMENT,
        orderId: { in: allOrderIds },
      },
      _sum: { amount: true },
    });
    for (const g of perOrderPayments) {
      if (!g.orderId) continue;
      const paid = Number.parseFloat(g._sum.amount?.toString() ?? '0');
      const cur = perOrder.get(g.orderId);
      if (cur && Number.isFinite(paid)) cur.paid = paid;
    }

    // 3) Customer-wide totals to derive the still-unallocated pool.
    const customerTotals = await this.prisma.debtLedgerEntry.groupBy({
      by: ['customerId', 'source'],
      where: { customerId: { in: customerIds } },
      _sum: { amount: true },
    });
    const debtByCust = new Map<string, number>();
    const paidByCust = new Map<string, number>();
    for (const g of customerTotals) {
      const v = Number.parseFloat(g._sum.amount?.toString() ?? '0');
      if (!Number.isFinite(v)) continue;
      if (g.source === DebtSource.PAYMENT) {
        paidByCust.set(g.customerId, (paidByCust.get(g.customerId) ?? 0) + v);
      } else {
        debtByCust.set(g.customerId, (debtByCust.get(g.customerId) ?? 0) + v);
      }
    }

    // 4) Bucket the aggregated per-order rows by customer, oldest-first,
    //    and allocate customer-level open-pool FIFO. An invoice is open
    //    iff its FIFO share is materially positive (>0.0001 KWD, same
    //    tolerance as DebtService to stay in lock-step).
    const byCustomer = new Map<string, Agg[]>();
    for (const agg of perOrder.values()) {
      const arr = byCustomer.get(agg.customerId) ?? [];
      arr.push(agg);
      byCustomer.set(agg.customerId, arr);
    }
    for (const [cid, arr] of byCustomer) {
      arr.sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime());
      const debtTotal = debtByCust.get(cid) ?? 0;
      const paidTotal = paidByCust.get(cid) ?? 0;
      let remainingOpen = Math.max(debtTotal - paidTotal, 0);
      for (const item of arr) {
        const perOrderNet = Math.max(item.shortfall - item.paid, 0);
        const share = Math.min(perOrderNet, remainingOpen);
        if (share > 0.0001) openIds.add(item.orderId);
        remainingOpen -= share;
      }
    }

    return openIds;
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

  async findAllForActor(
    userId: string,
    role: string,
    branchId: string | null,
    filters: {
      driverId?: string;
      status?: OrderStatus;
      posPaymentMethod?: PosPaymentMethod;
      cashStatus?: CashStatus;
      from?: string;
      to?: string;
      q?: string;
    } = {},
  ): Promise<OrderDetailWithListFlags[]> {
    const where: Prisma.OrderWhereInput = {};

    // V19.22.5 — Branch scoping (Dastur §11).
    // MANAGER sees ONLY invoices belonging to their branch — both
    // rows issued by the branch itself AND rows issued by drivers
    // assigned to that branch. Exec pair (OWNER/GM) + CC keep
    // full-fleet visibility. DRIVER is locked to their own rows.
    if (role === SafariRole.DRIVER) {
      where.driverId = userId;
    } else if (role === SafariRole.MANAGER) {
      if (!branchId) {
        return [];
      }
      where.driver = { branchId };
    } else if (!this.canViewAllOrders(role)) {
      return [];
    }

    // Explicit driver filter (used by Invoices page dropdown).
    if (filters.driverId) {
      if (role === SafariRole.DRIVER && filters.driverId !== userId) {
        return [];
      }
      where.driverId = filters.driverId;
      // Reset the relational predicate — the explicit driverId is
      // strictly stronger than the branch scope.
      delete (where as { driver?: unknown }).driver;
    }

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.posPaymentMethod) {
      where.posPaymentMethod = filters.posPaymentMethod;
    }
    if (filters.cashStatus) {
      where.cashStatus = filters.cashStatus;
    }

    // Date range: interpret "from" / "to" as Kuwait-local dates if
    // passed bare YYYY-MM-DD, otherwise as full ISO timestamps. We
    // don't force-set time zones here because the frontend already
    // sends inclusive bounds.
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }

    if (filters.q && filters.q.trim().length > 0) {
      const q = filters.q.trim();
      where.OR = [
        { invoiceNumber: { contains: q, mode: 'insensitive' } },
        { serialNumber: { contains: q, mode: 'insensitive' } },
        { customer: { phone: { contains: q } } },
        { customer: { phone2: { contains: q } } },
        { customer: { displayName: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const rows = await this.prisma.order.findMany({
      where,
      select: orderDetailSelect,
      orderBy: { createdAt: 'desc' },
    });
    if (rows.length === 0) {
      return [];
    }
    const withEdit = await this.prisma.invoiceAuditLog.findMany({
      where: {
        orderId: { in: rows.map((r) => r.id) },
        action: InvoiceAuditAction.EDIT,
      },
      select: { orderId: true },
      distinct: ['orderId'],
    });
    const editSet = new Set(withEdit.map((a) => a.orderId));
    return rows.map((o) => ({
      ...o,
      hasSupervisorEdit: editSet.has(o.id),
    }));
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

  /**
   * V19.24 — Mint a 7-day signed URL for the same POS receipt HTML the
   * staff print view uses. Customer opens `/public/invoice/:token` from
   * WhatsApp and saves as PDF locally (wa.me cannot attach binary PDFs).
   */
  async mintInvoiceShareLink(
    orderId: string,
    publicBaseUrl: string,
  ): Promise<{
    token: string;
    shareUrl: string;
    pdfUrl?: string;
    expiresAtIso: string;
  }> {
    const exists = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Order not found');
    }
    const token = await this.jwt.signAsync(
      { purpose: 'INVOICE_SHARE' as const, orderId },
      { expiresIn: '7d' },
    );
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const base = publicBaseUrl.replace(/\/$/, '');
    return {
      token,
      shareUrl: `${base}/public/invoice/${encodeURIComponent(token)}`,
      pdfUrl: buildPublicInvoicePdfUrl(token),
      expiresAtIso: expiresAt.toISOString(),
    };
  }

  /**
   * Public GET for `GET /api/public/invoice/:token` — same `orderDetailSelect`
   * payload as staff `GET /api/orders/:id` after JWT verification.
   */
  private normalizePublicInvoiceTokenParam(raw: string): string {
    const t = (raw ?? '').trim();
    if (!t) {
      return t;
    }
    try {
      return decodeURIComponent(t);
    } catch {
      return t;
    }
  }

  /**
   * V19.27 — Stream a simple A4 PDF (English labels; numbers match order totals).
   * Moatmt and other clients fetch this URL as `application/pdf` without SPA auth.
   */
  async getPublicInvoicePdfStream(token: string): Promise<{
    stream: PassThrough;
    filename: string;
  }> {
    const normalized = this.normalizePublicInvoiceTokenParam(token);
    const order = await this.getOrderForPublicInvoiceToken(normalized);
    const inv =
      order.invoiceNumber?.trim() ||
      order.serialNumber?.trim() ||
      order.id.slice(0, 8);
    const safe = inv.replace(/[^\w\u0600-\u06FF-]+/g, '_');
    const filename = `invoice-${safe}.pdf`;
    const stream = new PassThrough();
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: { Title: `Invoice ${inv}` },
    });
    doc.on('error', (err) => stream.destroy(err));
    doc.pipe(stream);
    doc.fillColor('#0f766e').fontSize(16).text('Safari Omni — Invoice', {
      align: 'center',
    });
    doc.moveDown(0.4);
    doc
      .fillColor('#0f172a')
      .fontSize(10)
      .text(`Invoice / serial: ${inv}`);
    doc.text(
      `Date: ${order.createdAt.toLocaleString('en-GB', { timeZone: 'Asia/Kuwait' })}`,
    );
    doc.text(`Order id: ${order.id}`);
    doc.text(`Total: ${order.totalPrice.toFixed(3)} KWD`);
    if (order.customer?.phone) {
      doc.text(`Phone: ${order.customer.phone}`);
    }
    if (order.driver?.fullName) {
      doc.text(`Driver: ${order.driver.fullName}`);
    }
    doc.moveDown(0.4);
    doc
      .fillColor('#0f172a')
      .fontSize(9)
      .text('Line items', { underline: true });
    const lines = [...order.lineItems].sort((a, b) => a.id.localeCompare(b.id));
    for (const li of lines) {
      const unit = Number(li.unitPrice);
      const qty = Number(li.quantity);
      const sub = (unit * qty).toFixed(3);
      const label = (li.label ?? 'Item').replace(/\s+/g, ' ');
      doc.text(
        `• ${label}  x${String(qty)}  @${unit.toFixed(3)} KWD  =  ${sub} KWD`,
        { width: 515 },
      );
    }
    doc.end();
    return { stream, filename };
  }

  async getOrderForPublicInvoiceToken(token: string): Promise<OrderDetail> {
    const normalized = this.normalizePublicInvoiceTokenParam(token);
    let payload: { purpose?: string; orderId?: string };
    try {
      payload = await this.jwt.verifyAsync(normalized);
    } catch (e: unknown) {
      const name =
        e && typeof e === 'object' && 'name' in e ?
          String((e as { name: string }).name)
        : '';
      if (name === 'TokenExpiredError') {
        throw new NotFoundException('رابط الفاتورة منتهي الصلاحية');
      }
      if (name === 'JsonWebTokenError' || name === 'NotBeforeError') {
        throw new NotFoundException(
          'رابط الفاتورة غير صالح — انسخ التوكن كاملاً، أو راجع تطابق JWT_SECRET بين البيئات',
        );
      }
      throw new NotFoundException(
        'رابط الفاتورة غير صالح أو منتهي الصلاحية',
      );
    }
    if (payload.purpose !== 'INVOICE_SHARE' || !payload.orderId) {
      throw new NotFoundException('رابط الفاتورة غير صالح');
    }
    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      select: orderDetailSelect,
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
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
    await assertUserNotOnAdministrativeBranchForSales(
      this.prisma,
      dto.driverId,
    );
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
        posPaymentMethod: true,
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
      data.cashStatus = cashStatusForPaymentMethod(order.posPaymentMethod);
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
    const opsDrivers = await this.prisma.user.findMany({
      where: {
        safariRole: SafariRole.DRIVER,
        OR: [
          { branchId: null },
          { branch: { isAdministrative: false } },
        ],
      },
      select: { id: true },
    });
    const opsDriverIds = new Set(opsDrivers.map((u) => u.id));

    const totalActiveOrders = await this.prisma.order.count({
      where: {
        status: { notIn: terminalStatuses },
        OR: [
          { driverId: null },
          { driverId: { in: [...opsDriverIds] } },
        ],
      },
    });
    const agg = await this.prisma.order.aggregate({
      where: {
        status: OrderStatus.COMPLETED,
        OR: [
          { driverId: null },
          { driverId: { in: [...opsDriverIds] } },
        ],
      },
      _sum: { totalPrice: true },
    });
    const sum = agg._sum.totalPrice;

    const grouped = await this.prisma.order.groupBy({
      by: ['driverId'],
      where: {
        status: OrderStatus.COMPLETED,
        driverId: { in: [...opsDriverIds] },
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
