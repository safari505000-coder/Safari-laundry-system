import {
  BadRequestException,
  ForbiddenException,
  Inject,
  InternalServerErrorException,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CashStatus,
  GeneralLedgerEntryType,
  InvoiceAuditAction,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
  SafariRole,
  ServiceType,
} from '@prisma/client';
import {
  ORDER_CREATED_EVENT,
  type OrderCreatedEventPayload,
} from '../dispatch/dispatch.events';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CustomerBlockingService } from '../common/services/customer-blocking.service';
import { OutstandingService } from '../finance/outstanding/outstanding.service';
import { PaymentsService } from '../common/services/payments.service';
import { CustomerNotificationsService } from '../customer-notifications/customer-notifications.service';
import { CustomerLedgerService } from '../customer-ledger/customer-ledger.service';
import { isPaymentLinkImmediateDebtEnabled } from '../customer-ledger/customer-ledger.types';
import { cashStatusForPaymentMethod } from '../common/utils/cash-status-for-method';
import { resolveCustomerPhoneForNotify } from '../common/validation/kuwait-customer-phone';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { DebtVisibilityService } from '../finance/debt-visibility/debt-visibility.service';
import {
  computeCanonicalDriverPendingInvoiceProjection,
  computeCanonicalUnpaidOnlineReportProjection,
} from '../finance/canonical-financial-projection';
import { parseFixed4ToMinor, toMinorFromFixed4 } from '../finance/finance-money';
import { InventoryService } from '../inventory/inventory.service';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { assertUserNotOnAdministrativeBranchForSales } from '../branches/administrative-branch.util';
import {
  computeOrderRemainingBalancesBatch,
  getCustomerDebtSnapshotTotalKd,
  getCustomerNetDebtFromDebtLedgerAgg,
  INVOICE_REMAINING_TOLERANCE_KD,
} from '../finance/debt-customer-aggregates.util';
import {
  buildDebtKdBreakdownTrace,
  type DebtKdBreakdownTrace,
} from './debt-kd-breakdown.util';
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
import {
  PAYMENT_LINK_VALIDITY_MS,
  POS_DELIVERY_FEE_KD,
  POS_ORDER_INTERACTIVE_TX,
  STALE_QUICK_ORDER_THRESHOLD_MS,
  terminalStatuses,
} from './order-constants';
import {
  canStaffUpdateOrders,
  canViewAllOrders,
} from './order-role-policy';
import { orderDetailSelect } from './order-selects';
import {
  mapPosCheckoutLineItems,
  reconcileLineItems,
  resolveLaundryTierPrice,
  resolvePosCheckoutPaymentMethod,
} from './order-pos-pricing.util';
import {
  collectionDebtReasonAr,
  formatLineItemsBlockForNotify,
  invoiceLabelForCustomerNotify,
} from './order-notification-format.util';
import {
  type OrderDetail,
  type OrderDetailWithListFlags,
  type PosCheckoutBundleResult,
  type PosCheckoutOrderDetail,
  type PosPricedLineCreate,
  type PosServiceKey,
  type PrismaOrderDb,
} from './order-types';
import { OrderCustomerNotificationService } from './order-customer-notification.service';
import { OrderPublicInvoiceService } from './order-public-invoice.service';
import { PassThrough } from 'node:stream';

export { orderDetailSelect } from './order-selects';
export type { OrderDetail } from './order-types';

export function resolveOperationalDebtKd(input: {
  ledgerNetKd: Prisma.Decimal;
  snapshotFromWalletKd: Prisma.Decimal;
  orderMarketScopeKd: Prisma.Decimal;
}): Prisma.Decimal {
  return Prisma.Decimal.max(input.ledgerNetKd, input.snapshotFromWalletKd);
}

@Injectable()
export class OrdersService {
  private readonly log = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CustomerLedgerService))
    private readonly customerLedger: CustomerLedgerService,
    private readonly paymentsService: PaymentsService,
    private readonly customerNotifications: CustomerNotificationsService,
    private readonly generalLedger: GeneralLedgerService,
    private readonly serialCounter: SerialCounterService,
    private readonly inventory: InventoryService,
    private readonly customerBlocking: CustomerBlockingService,
    private readonly orderCustomerNotifications: OrderCustomerNotificationService,
    private readonly orderPublicInvoices: OrderPublicInvoiceService,
    @Inject(forwardRef(() => OutstandingService))
    private readonly outstanding: OutstandingService,
    private readonly auditLogs: AuditLogsService,
    private readonly events: EventEmitter2,
    private readonly debtVisibility: DebtVisibilityService,
  ) {}

  /**
   * V19.x — Fire-and-forget broadcast that an Order row was committed.
   * Listened to by `DispatchService.handleOrderCreated` to auto-close
   * any matching dispatch (Part 4 of the call-center brief). Always
   * emits, even when the order has no dispatchId — the listener
   * filters internally so this stays a single-line hook.
   */
  private emitOrderCreated(
    order: Pick<OrderDetail, 'id' | 'dispatchId' | 'createdAt'>,
    actorUserId: string | null,
  ): void {
    this.events.emit(ORDER_CREATED_EVENT, {
      orderId: order.id,
      dispatchId: order.dispatchId ?? null,
      actorUserId,
      occurredAtIso: order.createdAt.toISOString(),
    } satisfies OrderCreatedEventPayload);
  }

  /**
   * V20.4 — Phase 5 typed financial event. Mirrors the
   * dispatch broadcast above so the read-side projection
   * refreshes within milliseconds of an invoice landing in
   * the database. Goes through `customerLedger.emitFinancialEvent`
   * which absorbs missing-publisher conditions for tests.
   */
  private emitInvoiceIssued(
    order: Pick<
      OrderDetail,
      'id' | 'createdAt' | 'totalPrice' | 'posPaymentMethod' | 'customer'
    >,
  ): void {
    if (!order.customer?.id) return;
    this.customerLedger.emitFinancialEvent('finance.invoice.issued', {
      customerId: order.customer.id,
      orderId: order.id,
      correlationId: order.id,
      occurredAt: order.createdAt.toISOString(),
      invoiceTotalKd: order.totalPrice.toString(),
      posPaymentMethod: order.posPaymentMethod ?? null,
    });
  }

  private auditOrderCreated(order: OrderDetail, actorUserId: string | null): void {
    this.auditLogs.logFinancialEvent({
      action: 'ORDER_CREATED',
      customerId: order.customer.id,
      orderId: order.id,
      amount: order.totalPrice.toString(),
      source: order.posPaymentMethod ?? 'UNKNOWN',
      userId: actorUserId,
      changes: {
        status: order.status,
        cashStatus: order.cashStatus,
        posPaymentMethod: order.posPaymentMethod,
      },
    });
  }

  private auditOrderPayment(order: OrderDetail, actorUserId: string | null): void {
    this.auditLogs.logFinancialEvent({
      action: 'PAYMENT_MADE',
      customerId: order.customer.id,
      orderId: order.id,
      amount: order.totalPrice.toString(),
      source: order.posPaymentMethod ?? 'UNKNOWN',
      userId: actorUserId,
      changes: {
        cashStatus: order.cashStatus,
        posPaymentMethod: order.posPaymentMethod,
      },
    });
  }

  /**
   * V19.25 — Mint public share + optional PDF for Moatmt. V19.27.1 — If
   * `PUBLIC_WEB_APP_URL` is missing but `PUBLIC_API_URL` (or payment callback
   * base) is set, we still mint JWT so `invoicePdfUrl` can be sent; web receipt
   * link is omitted in that case.
   */
  private async resolveInvoiceShareForNotify(
    orderId: string,
  ): Promise<{ shareUrl?: string; pdfUrl?: string } | undefined> {
    return this.orderPublicInvoices.resolveInvoiceShareForNotify(orderId);
  }

  /**
   * Sends invoice + payment/receipt text to the customer (webhook if configured).
   * Call with `void …catch` for non-**ONLINE** checkouts; **await** for ONLINE
   * so the UPayments link + receipt text is delivered before the HTTP response
   * returns to the POS.
   */
  private async posInvoiceNotifyToCustomer(
    detail: PosCheckoutOrderDetail,
    phoneCompact: string,
  ): Promise<void> {
    await this.orderCustomerNotifications.sendPosInvoiceIssued(
      detail,
      phoneCompact,
    );
  }

  private async autoSendDirectPaymentLink(
    order: OrderDetail,
    fallbackPhone?: string,
  ): Promise<void> {
    if (
      order.status === OrderStatus.CANCELED ||
      order.cashStatus !== CashStatus.UNPAID
    ) {
      return;
    }
    if (
      order.posPaymentMethod !== PosPaymentMethod.ONLINE &&
      order.posPaymentMethod !== PosPaymentMethod.PAYMENT_LINK
    ) {
      return;
    }
    const phone = resolveCustomerPhoneForNotify(
      order.customer.phone,
      order.customer.phone2,
      fallbackPhone,
    );
    if (!phone.trim()) {
      return;
    }
    const link = await this.paymentsService.ensurePaymentLinkForUnpaidOrder(order.id);
    const lineItemsSummary = formatLineItemsBlockForNotify(order);
    await this.customerNotifications.deliverInvoiceIssuedNow({
      customerPhone: phone,
      orderId: order.id,
      invoiceLabel: invoiceLabelForCustomerNotify(order),
      amountKd: order.totalPrice.toFixed(3),
      paymentUrl: link.url,
      lineItemsSummary: lineItemsSummary || undefined,
    });
    await this.prisma.order.update({
      where: { id: order.id },
      data: { ccCollectionPaymentWaLocked: true },
    });
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
   * V19.x — Defense-in-depth guard for the Call-Center / Dispatch
   * module (Part 5 of the reliability brief).
   *
   * Today, CALL_CENTER is already blocked from EVERY order-create
   * path via `assertPosCheckoutActor` and the role guards on
   * controllers — this helper is intentionally additive.
   *
   * If a future iteration grants CALL_CENTER any order-create
   * permission, this guard kicks in IMMEDIATELY and requires
   * `dispatchId` on the request. Without it, an order created from
   * a CALL_CENTER session would have no parent dispatch, breaking
   * the "Order = the only completer of a dispatch" contract.
   *
   * Returns silently for any other actor role so the existing
   * driver / manager hot paths take ZERO extra DB latency on the
   * happy branch (one indexed lookup; SafariRole returns from cache
   * on warm queries).
   */
  private async assertCallCenterDispatchRequirement(
    actorUserId: string,
    dispatchId: string | null | undefined,
  ): Promise<void> {
    const u = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { safariRole: true },
    });
    if (u?.safariRole === SafariRole.CALL_CENTER && !dispatchId) {
      throw new BadRequestException({
        code: 'CALL_CENTER_DISPATCH_REQUIRED',
        message:
          'CALL_CENTER actors must supply dispatchId on order creation.',
      });
    }
  }

  private async pricePosCheckoutLines(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    lineItems?: OrderLineItemDto[],
  ): Promise<{
    lineCreates: PosPricedLineCreate[];
    totalPriceDecimal: Prisma.Decimal;
  }> {
    const input = lineItems ?? [];
    if (input.length === 0) {
      throw new BadRequestException('POS checkout requires line items.');
    }

    const actor = await tx.user.findUnique({
      where: { id: actorUserId },
      select: { branchId: true },
    });
    const branchId = actor?.branchId ?? null;
    const itemIds = [
      ...new Set(
        input
          .map((line) => line.laundryPriceListItemId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];
    if (itemIds.length !== input.length) {
      throw new BadRequestException(
        'POS checkout lines must reference catalog item ids.',
      );
    }

    const items = await tx.laundryPriceListItem.findMany({
      where: { id: { in: itemIds }, isActive: true },
      include: {
        branchOverrides: branchId ? { where: { branchId } } : true,
      },
    });
    const byId = new Map(items.map((item) => [item.id, item]));
    let total = new Prisma.Decimal(0);
    const lineCreates: PosPricedLineCreate[] = [];

    for (const line of input) {
      const serviceKey = line.posServiceKey;
      if (
        serviceKey !== 'NORMAL' &&
        serviceKey !== 'URGENT' &&
        serviceKey !== 'PRESS_ONLY' &&
        serviceKey !== 'URGENT_PRESS'
      ) {
        throw new BadRequestException('POS checkout lines must include service tier.');
      }
      if (!(line.quantity > 0)) {
        throw new BadRequestException('Each line item must have a positive quantity.');
      }
      const item = byId.get(line.laundryPriceListItemId!);
      if (!item) {
        throw new BadRequestException('Selected catalog item is inactive or missing.');
      }
      if (item.manualEntry) {
        throw new BadRequestException(
          'Manual-price catalog items are not allowed in mobile POS checkout.',
        );
      }
      const unitPrice = resolveLaundryTierPrice(item, serviceKey);
      if (unitPrice.lte(0)) {
        throw new BadRequestException('Selected service has no positive catalog price.');
      }
      const quantity = new Prisma.Decimal(Number(line.quantity).toFixed(4));
      const labelSuffix =
        serviceKey === 'NORMAL'
          ? 'غسيل عادي'
          : serviceKey === 'URGENT'
            ? 'خدمة سريعة'
            : serviceKey === 'PRESS_ONLY'
              ? 'كي فقط'
              : 'دراي كلين سريع';
      total = total.plus(quantity.mul(unitPrice));
      lineCreates.push({
        label: `${item.nameAr} — ${labelSuffix}`,
        starchOption: 'NONE',
        quantity: quantity.toFixed(4),
        unitPrice: unitPrice.toFixed(4),
        stockItemId: line.stockItemId ?? null,
      });
    }

    total = total.plus(POS_DELIVERY_FEE_KD);
    lineCreates.push({
      label: 'توصيل داخل المنطقة',
      starchOption: 'NONE',
      quantity: '1.0000',
      unitPrice: POS_DELIVERY_FEE_KD.toFixed(4),
      stockItemId: null,
    });

    return {
      lineCreates,
      totalPriceDecimal: new Prisma.Decimal(total.toFixed(4)),
    };
  }

  /**
   * Driver POS checkout pricing:
   * - Catalog-only payloads (mobile garment lines) → server-side tier pricing + delivery row.
   * - Mixed/receipt payloads (VIP, attached-invoice delivery @ 0) → trust client line totals.
   */
  private async resolvePosCheckoutPricing(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    dto: PosCheckoutDto,
  ): Promise<{
    lineCreates: PosPricedLineCreate[];
    totalPriceDecimal: Prisma.Decimal;
  }> {
    const items = dto.lineItems ?? [];
    if (items.length === 0) {
      throw new BadRequestException('POS checkout requires line items.');
    }
    const catalogOnly = items.every(
      (line) =>
        typeof line.laundryPriceListItemId === 'string' &&
        line.laundryPriceListItemId.length > 0 &&
        line.posServiceKey,
    );
    if (catalogOnly) {
      return this.pricePosCheckoutLines(tx, actorUserId, dto.lineItems);
    }
    reconcileLineItems(dto.totalPrice, items);
    const mapped = mapPosCheckoutLineItems(items);
    if (!mapped?.length) {
      throw new BadRequestException('POS checkout requires line items.');
    }
    for (const line of mapped) {
      if (!(line.quantity > 0 && line.unitPrice >= 0)) {
        throw new BadRequestException(
          'Each line item must have a positive quantity and a non-negative unit price',
        );
      }
    }
    return {
      lineCreates: mapped.map((line) => ({
        label: line.label,
        starchOption: 'NONE' as const,
        quantity: Number(line.quantity).toFixed(4),
        unitPrice: Number(line.unitPrice).toFixed(4),
        stockItemId: line.stockItemId,
      })),
      totalPriceDecimal: new Prisma.Decimal(Number(dto.totalPrice).toFixed(4)),
    };
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
    const quickPayment = resolvePosCheckoutPaymentMethod(0n, dto.posPaymentMethod);
    if (
      !quickPayment ||
      quickPayment === PosPaymentMethod.SUBSCRIPTION_WALLET
    ) {
      throw new BadRequestException(
        'posPaymentMethod must be CASH, KNET, PAYMENT_LINK, ONLINE, or DEBT_ON_ACCOUNT',
      );
    }
    await this.assertDriverUser(driverUserId);
    // CreateOrderQuickDto does not (yet) carry `dispatchId`. The
    // guard therefore falls through for DRIVER actors but blocks any
    // future CALL_CENTER actor that reaches this code path until the
    // DTO is extended with `dispatchId` and a value is supplied.
    await this.assertCallCenterDispatchRequirement(driverUserId, null);
    await assertUserNotOnAdministrativeBranchForSales(
      this.prisma,
      driverUserId,
    );
    const serviceType = dto.serviceType ?? ServiceType.NORMAL;
    const lineCreates = reconcileLineItems(dto.totalPrice, dto.lineItems);
    const phoneCompact = dto.customerPhone.replace(/[\s-]/g, '').trim();

    const order = await this.prisma.$transaction(async (tx) => {
      const customerId = await this.resolveQuickOrderCustomerId(
        tx,
        dto,
        phoneCompact,
      );
      // V19.x — Outstanding Payments fail-closed gate: refuse to
      // create an invoice for a manually-blocked customer. Manual
      // toggling is the ONLY path that flips this flag.
      await this.outstanding.assertNotBlocked(customerId);
      const serialNumber = await this.serialCounter.stampOrderSerial(
        tx,
        driverUserId,
      );
      const created = await tx.order.create({
        data: {
          customerId,
          driverId: driverUserId,
          serviceType,
          totalPrice: dto.totalPrice,
          status: OrderStatus.PENDING,
          invoiceNumber: dto.invoiceNumber?.trim() || null,
          serialNumber,
          notes: dto.notes?.trim() || null,
          posPaymentMethod: quickPayment,
          ...(lineCreates?.length
            ? { lineItems: { create: lineCreates } }
            : {}),
        },
        select: orderDetailSelect,
      });
      if (
        isPaymentLinkImmediateDebtEnabled() &&
        (created.posPaymentMethod === PosPaymentMethod.ONLINE ||
          created.posPaymentMethod === PosPaymentMethod.PAYMENT_LINK)
      ) {
        await this.customerLedger.registerPendingPaymentLinkReceivableTx(
          tx,
          created.id,
          customerId,
          created.totalPrice,
        );
      }
      return created;
    });
    this.auditOrderCreated(order, driverUserId);
    if (
      order.posPaymentMethod === PosPaymentMethod.ONLINE ||
      order.posPaymentMethod === PosPaymentMethod.PAYMENT_LINK
    ) {
      try {
        await this.autoSendDirectPaymentLink(order, phoneCompact);
      } catch (e) {
        this.log.warn(`auto direct payment-link send failed (createQuick): ${e}`);
      }
    }
    await this.customerBlocking.autoBlockIfNeeded(order.customer.id);
    return order;
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
      await this.assertCallCenterDispatchRequirement(
        driverUserId,
        dto.dispatchId,
      );
      await assertUserNotOnAdministrativeBranchForSales(
        this.prisma,
        driverUserId,
      );
      const serviceType = dto.serviceType ?? ServiceType.NORMAL;
      const phoneCompact = dto.customerPhone.replace(/[\s-]/g, '').trim();

      const orderId = await this.prisma.$transaction(
        async (tx) => {
          const { lineCreates, totalPriceDecimal } =
            await this.resolvePosCheckoutPricing(tx, driverUserId, dto);
          const customerId = await this.resolveQuickOrderCustomerId(
            tx,
            dto,
            phoneCompact,
          );
          await this.outstanding.assertNotBlocked(customerId);

          const walletRow = await tx.customerWallet.findUnique({
            where: { customerId },
          });
          const balanceMinor = walletRow
            ? toMinorFromFixed4(walletRow.balance)
            : 0n;
          const totalMinor = parseFixed4ToMinor(totalPriceDecimal.toFixed(4));
          const shortfallMinor =
            totalMinor > balanceMinor ? totalMinor - balanceMinor : 0n;

          const posPaymentMethodResolved = resolvePosCheckoutPaymentMethod(
            shortfallMinor,
            dto.posPaymentMethod,
          );
          if (posPaymentMethodResolved === PosPaymentMethod.SUBSCRIPTION_WALLET) {
            const now = new Date();
            const activeSubscription = await tx.customerSubscription.findFirst({
              where: {
                customerId,
                status: 'ACTIVE',
                expiresAt: { gt: now },
              },
              select: { id: true },
            });
            if (!activeSubscription) {
              throw new BadRequestException(
                'Customer has no active subscription. Choose CASH, KNET, ONLINE, PAYMENT_LINK, or DEBT_ON_ACCOUNT.',
              );
            }
          }

          const useHostedPaymentLink =
            shortfallMinor > 0n &&
            (posPaymentMethodResolved === PosPaymentMethod.ONLINE ||
              posPaymentMethodResolved === PosPaymentMethod.PAYMENT_LINK);

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
                posPaymentMethod: posPaymentMethodResolved,
                completedAt: null,
                invoiceNumber: dto.invoiceNumber?.trim() || null,
                serialNumber,
                notes: dto.notes?.trim() || null,
                // V19.x — Optional call-center dispatch fulfillment
                // pointer; the post-commit emit closes the matching
                // dispatch via DispatchService.handleOrderCreated.
                dispatchId: dto.dispatchId ?? null,
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
            if (isPaymentLinkImmediateDebtEnabled()) {
              await this.customerLedger.registerPendingPaymentLinkReceivableTx(
                tx,
                created.id,
                customerId,
                totalPriceDecimal,
              );
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
              // V19.x — see sibling block above (ONLINE branch).
              dispatchId: dto.dispatchId ?? null,
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
        POS_ORDER_INTERACTIVE_TX,
      );

      const detail = await this.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: orderDetailSelect,
      });

      if (
        (detail.posPaymentMethod === PosPaymentMethod.ONLINE ||
          detail.posPaymentMethod === PosPaymentMethod.PAYMENT_LINK) &&
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
        this.auditOrderCreated(merged, driverUserId);
        this.emitOrderCreated(merged, driverUserId);
        this.emitInvoiceIssued(merged);
        await this.posInvoiceNotifyToCustomer(merged, phoneCompact);
        await this.prisma.order.update({
          where: { id: detail.id },
          data: { ccCollectionPaymentWaLocked: true },
        });
        await this.customerBlocking.autoBlockIfNeeded(merged.customer.id);
        return merged;
      }

      void this.posInvoiceNotifyToCustomer(detail, phoneCompact).catch((e) =>
        this.log.warn(`pos invoice notify: ${e}`),
      );
      // Same thank-you + rating link as gateway / CC mark-paid (field cash & KNET included).
      this.paymentsService.schedulePaymentConfirmedCustomerNotify(
        detail.id,
        'new_pos_order',
      );
      this.auditOrderCreated(detail, driverUserId);
      this.emitOrderCreated(detail, driverUserId);
      this.emitInvoiceIssued(detail);
      this.auditOrderPayment(detail, driverUserId);
      await this.customerBlocking.autoBlockIfNeeded(detail.customer.id);
      return detail;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        this.log.error(
          `POS_CHECKOUT_ERROR Prisma code=${error.code} meta=${JSON.stringify(error.meta ?? {})}`,
        );
      } else {
        this.log.error(
          `POS_CHECKOUT_ERROR ${error instanceof Error ? error.message : String(error)}`,
        );
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
        reconcileLineItems(part.totalPrice, part.lineItems);
      }
      const lineCreates = mapPosCheckoutLineItems(part.lineItems);
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
        await this.outstanding.assertNotBlocked(customerId);

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
      POS_ORDER_INTERACTIVE_TX,
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

    await this.orderCustomerNotifications.sendPosBundleInvoiceIssued({
      orders,
      customerPhone: phone,
      amountKd: sumDecimal.toFixed(3),
      paymentUrl: paymentLink.url,
    });
    await this.prisma.order.updateMany({
      where: { posPaymentBundleId: bundleId },
      data: { ccCollectionPaymentWaLocked: true },
    });

    orders.forEach((order) => this.auditOrderCreated(order, driverUserId));
    await this.customerBlocking.autoBlockIfNeeded(orders[0]!.customer.id);
    return { bundleId, orders, paymentLink };
  }

  /** Manager / owner intake — optional assignment to a driver. */
  async createAsManager(
    dto: CreateOrderDto,
    managerUserId: string,
  ): Promise<OrderDetail> {
    // CreateOrderDto has no `dispatchId` field — manager-led intake
    // is intentionally outside the dispatch flow. A CALL_CENTER
    // actor reaching this path is therefore always rejected by the
    // guard below.
    await this.assertCallCenterDispatchRequirement(managerUserId, null);
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
    const lineCreates = reconcileLineItems(dto.totalPrice, dto.lineItems);
    const order = await this.prisma.$transaction(async (tx) => {
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
      await this.outstanding.assertNotBlocked(customer.id);
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
          posPaymentMethod: PosPaymentMethod.CASH,
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
    this.auditOrderCreated(order, dto.driverId ?? null);
    await this.customerBlocking.autoBlockIfNeeded(order.customer.id);
    return order;
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
    /** When set, returns every open collectible row for one customer (no global take cap). */
    customerId?: string,
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
      /** Live hosted link for the customer's full visible AR (not just this row). */
      fullBalanceLinkKd: string | null;
      fullBalancePaymentUrl: string | null;
      fullBalanceLinkSentAtIso: string | null;
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

    // V1.7.4 — Owner directive: DEBT_ON_ACCOUNT invoices must also feed
    // the Collections panel (previously the query filtered by
    // `cashStatus: UNPAID` only, which excluded debt-on-account sales
    // because their mapping pins cashStatus to PAID_TO_DRIVER even
    // though the customer still owes the money). We reuse the same
    // pattern the driver Field-Tracker already uses: widen with OR +
    // FIFO-filter via `resolveOpenDebtOrderIds`, so an invoice drops
    // off the list the moment the customer settles through any channel
    // (office cash by accountant, CC manual mark, partial debt payment,
    // gateway link, etc.).
    const collectiblesOr: Prisma.OrderWhereInput['OR'] = [
      { cashStatus: CashStatus.UNPAID },
      { posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT },
      { posPaymentMethod: PosPaymentMethod.ONLINE },
      { posPaymentMethod: PosPaymentMethod.PAYMENT_LINK },
      {
        posPaymentMethod: PosPaymentMethod.SUBSCRIPTION_WALLET,
        customer: {
          is: {
            wallet: {
              is: { debt: { gt: new Prisma.Decimal(0) } },
            },
          },
        },
      },
    ];
    const orderSelect = {
      id: true,
      customerId: true,
      serialNumber: true,
      invoiceNumber: true,
      totalPrice: true,
      posPaymentMethod: true,
      posHostedPaymentUrl: true,
      status: true,
      cashStatus: true,
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
        orderBy: { createdAt: 'asc' as const },
      },
    };
    let rows = await this.prisma.order.findMany({
      where: {
        status: { not: OrderStatus.CANCELED },
        ...(customerId ? { customerId } : {}),
        OR: collectiblesOr,
        ...(branchWhere ?? {}),
      },
      select: orderSelect,
      orderBy: { createdAt: 'desc' },
      ...(customerId ? {} : { take: 200 }),
    });

    type CollectionOrderRow = (typeof rows)[number];

    const mergeCustomerOpenCollectibleRows = async (
      customerIds: string[],
      knownIds: Set<string>,
    ): Promise<CollectionOrderRow[]> => {
      if (customerIds.length === 0) return [];
      const extra = await this.prisma.order.findMany({
        where: {
          customerId: { in: customerIds },
          id: { notIn: [...knownIds] },
          status: { not: OrderStatus.CANCELED },
        },
        select: orderSelect,
        orderBy: { createdAt: 'desc' },
      });
      if (extra.length === 0) return [];
      const remainingMap = await computeOrderRemainingBalancesBatch(
        this.prisma,
        extra.map((r) => r.id),
      );
      const tolerance = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);
      return extra.filter((r) => {
        const remaining = remainingMap.get(r.id) ?? r.totalPrice;
        if (remaining.greaterThan(tolerance)) return true;
        return (
          r.status === OrderStatus.PENDING &&
          r.cashStatus === CashStatus.UNPAID &&
          r.totalPrice.greaterThan(tolerance)
        );
      });
    };

    // Customer-scoped reads must mirror the public portal: every journal-open
    // order line, not only rows matching the global collectibles OR predicate.
    if (customerId) {
      const merged = await mergeCustomerOpenCollectibleRows(
        [customerId],
        new Set(rows.map((r) => r.id)),
      );
      if (merged.length > 0) {
        rows = [...rows, ...merged];
      }
    }

    // V20.8.1 — every row, including cashStatus=UNPAID, is filtered by
    // canonical remaining balance. Subscription activation and partial
    // payments may reduce an invoice without flipping cashStatus immediately,
    // so gross status alone is not enough for Collections visibility.
    const debtCandidates = rows.filter(
      (r) => r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT,
    );
    let openDebtOrderIds = await this.resolveOpenDebtOrderIds(
      debtCandidates.map((r) => ({ orderId: r.id, customerId: r.customerId })),
    );
    let remainingByOrder = await computeOrderRemainingBalancesBatch(
      this.prisma,
      rows.map((r) => r.id),
    );
    const tol = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);
    const buildCollectibleRemaining = (
      remainingMap: Map<string, Prisma.Decimal>,
    ) => {
      return (r: (typeof rows)[number]) => {
        const remaining = remainingMap.get(r.id) ?? r.totalPrice;
        if (
          remaining.lessThanOrEqualTo(tol) &&
          r.status === OrderStatus.PENDING &&
          r.cashStatus === CashStatus.UNPAID
        ) {
          return r.totalPrice;
        }
        return remaining;
      };
    };
    let collectibleRemaining = buildCollectibleRemaining(remainingByOrder);
    let filteredRows = rows.filter((r) => {
      const remaining = collectibleRemaining(r);
      if (remaining.lessThanOrEqualTo(tol)) return false;
      // Journal-open lines for a customer-scoped read (portal parity).
      if (customerId) return true;
      if (r.cashStatus === CashStatus.UNPAID) return true;
      if (
        r.posPaymentMethod === PosPaymentMethod.ONLINE ||
        r.posPaymentMethod === PosPaymentMethod.PAYMENT_LINK
      ) {
        return true;
      }
      if (r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT) {
        return openDebtOrderIds.has(r.id);
      }
      if (r.posPaymentMethod === PosPaymentMethod.SUBSCRIPTION_WALLET) {
        return remaining.greaterThan(tol);
      }
      return false;
    });

    // Rows already fetched (e.g. DEBT_ON_ACCOUNT) can fail the legacy
    // payment-method gates while still carrying journal-open balance.
    // Pull them back before gap-fetch so 4.250 + 10.250 both surface.
    if (!customerId && rows.length > 0) {
      const visibleEarly =
        await this.debtVisibility.getCustomerVisibleDebtBatch(
          Array.from(new Set(rows.map((r) => r.customerId))),
        );
      for (const cid of new Set(rows.map((r) => r.customerId))) {
        const visibleDebt = new Prisma.Decimal(
          visibleEarly.get(cid)?.remainingDebtKd ?? '0',
        );
        let rowSum = filteredRows
          .filter((r) => r.customerId === cid)
          .reduce(
            (sum, r) => sum.plus(collectibleRemaining(r)),
            new Prisma.Decimal(0),
          );
        if (visibleDebt.minus(rowSum).lessThanOrEqualTo(tol)) continue;
        for (const r of rows) {
          if (r.customerId !== cid) continue;
          if (filteredRows.some((f) => f.id === r.id)) continue;
          if (collectibleRemaining(r).greaterThan(tol)) {
            filteredRows.push(r);
            rowSum = rowSum.plus(collectibleRemaining(r));
          }
        }
      }
    }

    // Global queue uses take:200; older open lines for the same customer can
    // fall outside that window while the KPI still shows full visible AR.
    if (!customerId && filteredRows.length > 0) {
      const visibleEarly =
        await this.debtVisibility.getCustomerVisibleDebtBatch(
          Array.from(new Set(filteredRows.map((r) => r.customerId))),
        );
      const gapCustomerIds: string[] = [];
      for (const cid of new Set(filteredRows.map((r) => r.customerId))) {
        const visibleDebt = new Prisma.Decimal(
          visibleEarly.get(cid)?.remainingDebtKd ?? '0',
        );
        const rowSum = filteredRows
          .filter((r) => r.customerId === cid)
          .reduce(
            (sum, r) => sum.plus(collectibleRemaining(r)),
            new Prisma.Decimal(0),
          );
        if (visibleDebt.minus(rowSum).greaterThan(tol)) {
          gapCustomerIds.push(cid);
        }
      }
      if (gapCustomerIds.length > 0) {
        const knownIds = new Set(rows.map((r) => r.id));
        const extraRows = await mergeCustomerOpenCollectibleRows(
          gapCustomerIds,
          knownIds,
        );
        if (extraRows.length > 0) {
          rows = [...rows, ...extraRows];
          const mergedDebtCandidates = rows.filter(
            (r) => r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT,
          );
          openDebtOrderIds = await this.resolveOpenDebtOrderIds(
            mergedDebtCandidates.map((r) => ({
              orderId: r.id,
              customerId: r.customerId,
            })),
          );
          remainingByOrder = await computeOrderRemainingBalancesBatch(
            this.prisma,
            rows.map((r) => r.id),
          );
          collectibleRemaining = buildCollectibleRemaining(remainingByOrder);
          filteredRows = rows.filter((r) => {
            const remaining = collectibleRemaining(r);
            if (remaining.lessThanOrEqualTo(tol)) return false;
            if (r.cashStatus === CashStatus.UNPAID) return true;
            if (
              r.posPaymentMethod === PosPaymentMethod.ONLINE ||
              r.posPaymentMethod === PosPaymentMethod.PAYMENT_LINK
            ) {
              return true;
            }
            if (r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT) {
              return openDebtOrderIds.has(r.id);
            }
            if (r.posPaymentMethod === PosPaymentMethod.SUBSCRIPTION_WALLET) {
              return remaining.greaterThan(tol);
            }
            // Gap merge: journal-open lines for customers with AR drift.
            if (gapCustomerIds.includes(r.customerId)) return true;
            return false;
          });
        }
      }
    }
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    // V1.6.8 — Collections recall window (must stay in sync with
    // `ORDER_REMINDER_COOLDOWN_MS` in call-center.service.ts). Drives
    // the `canRemindNow` flag that greys out the Send-payment-link
    // button on the table until 2.5 h after the last reminder.
    const ORDER_REMINDER_COOLDOWN_MS = 2.5 * 60 * 60 * 1000;
    const visibleDebtByCustomer =
      await this.debtVisibility.getCustomerVisibleDebtBatch(
        Array.from(new Set(filteredRows.map((r) => r.customerId))),
      );
    const visibleBudgetByCustomer = new Map<string, Prisma.Decimal>();
    for (const cid of new Set(filteredRows.map((r) => r.customerId))) {
      const visibleDebt = new Prisma.Decimal(
        visibleDebtByCustomer.get(cid)?.remainingDebtKd ?? '0',
      );
      // Cap row display to banking-core customer AR so the table sum matches
      // the red KPI card (DebtVisibility), even when per-order journal slices
      // temporarily drift above the aggregate.
      visibleBudgetByCustomer.set(cid, visibleDebt);
    }
    const allocationOrder = [...filteredRows].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const projectedRows = allocationOrder.flatMap((r) => {
      const rawRemaining = collectibleRemaining(r);
      const customerBudget =
        visibleBudgetByCustomer.get(r.customerId) ?? new Prisma.Decimal(0);
      if (customerBudget.lessThanOrEqualTo(tol)) return [];
      const displayRemaining =
        rawRemaining.lessThanOrEqualTo(customerBudget)
          ? rawRemaining
          : customerBudget;
      visibleBudgetByCustomer.set(
        r.customerId,
        customerBudget.minus(displayRemaining),
      );
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
      const canSendCollectionPaymentWa = canRemindNow;
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
        // Displayed collections money is capped by the live banking-core
        // customer AR balance. Per-order remaining only allocates that
        // canonical balance across visible invoice rows.
        amountKd: displayRemaining.toFixed(3),
        paymentMethod: r.posPaymentMethod,
        paymentUrl: r.posHostedPaymentUrl ?? null,
        createdAtIso: r.createdAt.toISOString(),
        invoiceAgeDays,
        reminderCount: r.reminderCount,
        lastReminderAtIso: r.lastReminderAt
          ? r.lastReminderAt.toISOString()
          : null,
        canRemindNow,
        ccCollectionPaymentWaLocked: r.ccCollectionPaymentWaLocked,
        canSendCollectionPaymentWa,
        branchName,
        driverName,
        lineItems,
      };
    });
    return this.enrichCollectionRowsWithFullBalanceLinkInfo(projectedRows);
  }

  /**
   * Surfaces customer-level full-balance payment links on every queue row so
   * CC agents see when a 14.500 link is live vs a per-invoice 10.250 link.
   */
  private async enrichCollectionRowsWithFullBalanceLinkInfo<
    T extends { customerId: string },
  >(
    rows: T[],
  ): Promise<
    (T & {
      fullBalanceLinkKd: string | null;
      fullBalancePaymentUrl: string | null;
      fullBalanceLinkSentAtIso: string | null;
    })[]
  > {
    if (rows.length === 0) {
      return [];
    }
    const customerIds = Array.from(new Set(rows.map((r) => r.customerId)));
    const visibleByCustomer =
      await this.debtVisibility.getCustomerVisibleDebtBatch(customerIds);
    const tol = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);
    const linkOrders = await this.prisma.order.findMany({
      where: {
        customerId: { in: customerIds },
        posHostedPaymentUrl: { not: null },
        posGatewayTrackId: { not: null },
      },
      select: {
        customerId: true,
        posHostedPaymentUrl: true,
        posGatewayMetadata: true,
      },
    });

    const fullBalanceByCustomer = new Map<
      string,
      { amountKd: string; url: string; sentAtIso: string | null }
    >();

    for (const cid of customerIds) {
      const visibleDebt = new Prisma.Decimal(
        visibleByCustomer.get(cid)?.remainingDebtKd ?? '0',
      );
      if (visibleDebt.lessThanOrEqualTo(tol)) continue;

      for (const order of linkOrders.filter((o) => o.customerId === cid)) {
        const meta =
          order.posGatewayMetadata &&
          typeof order.posGatewayMetadata === 'object' &&
          !Array.isArray(order.posGatewayMetadata)
            ? (order.posGatewayMetadata as Record<string, unknown>)
            : null;
        if (!meta || !order.posHostedPaymentUrl) continue;

        const fullBalance = meta.fullBalance;
        if (
          fullBalance &&
          typeof fullBalance === 'object' &&
          !Array.isArray(fullBalance)
        ) {
          const fb = fullBalance as Record<string, unknown>;
          const amountRaw = fb.amountKd;
          if (typeof amountRaw === 'string' && amountRaw.trim()) {
            fullBalanceByCustomer.set(cid, {
              amountKd: new Prisma.Decimal(amountRaw).toFixed(3),
              url: order.posHostedPaymentUrl,
              sentAtIso:
                typeof fb.sentAt === 'string' ? fb.sentAt : null,
            });
            break;
          }
        }

        const storedCharge = this.readCollectionPaymentLinkChargeKd(meta);
        if (
          storedCharge &&
          storedCharge.sub(visibleDebt).abs().lessThanOrEqualTo(tol)
        ) {
          const charge = meta.charge;
          const sentAtIso =
            charge &&
            typeof charge === 'object' &&
            !Array.isArray(charge) &&
            typeof (charge as Record<string, unknown>).createdAt === 'string'
              ? ((charge as Record<string, unknown>).createdAt as string)
              : null;
          fullBalanceByCustomer.set(cid, {
            amountKd: storedCharge.toFixed(3),
            url: order.posHostedPaymentUrl,
            sentAtIso,
          });
          break;
        }
      }
    }

    return rows.map((row) => {
      const fb = fullBalanceByCustomer.get(row.customerId);
      return {
        ...row,
        fullBalanceLinkKd: fb?.amountKd ?? null,
        fullBalancePaymentUrl: fb?.url ?? null,
        fullBalanceLinkSentAtIso: fb?.sentAtIso ?? null,
      };
    });
  }

  private readCollectionPaymentLinkChargeKd(
    metadata: Record<string, unknown>,
  ): Prisma.Decimal | null {
    const charge = metadata.charge;
    if (!charge || typeof charge !== 'object' || Array.isArray(charge)) {
      return null;
    }
    const raw = (charge as Record<string, unknown>).amountKd;
    try {
      if (typeof raw === 'string' && raw.trim()) {
        return new Prisma.Decimal(raw);
      }
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        return new Prisma.Decimal(raw);
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * يبني تقرير الديون السوقية من صفوف التحصيل المفتوحة مع ملخص روابط الدفع والفروع دون تعديل أي دين.
   * Builds the market-debt report from open collection rows with payment-link and branch summaries without mutating debt.
   * @param branchId - معرف الفرع الاختياري لتقييد التقرير / Optional branch id for report scoping
   * @param actor - المستخدم الحالي لتطبيق نطاق الدور / Current actor used for role-based scoping
   * @returns صفوف التقرير وملخصات الفروع وروابط الدفع / Report rows plus branch and payment-link summaries
   */
  async listUnpaidCollectionOrdersReport(
    branchId: string | null = null,
    actor?: JwtUser,
  ): Promise<{
    rows: Awaited<ReturnType<OrdersService['listUnpaidCollectionOrders']>>;
    paymentLinkRows: Awaited<ReturnType<OrdersService['listUnpaidCollectionOrders']>>;
    branchSummaries: ReturnType<
      typeof computeCanonicalUnpaidOnlineReportProjection
    >['branchSummaries'];
    paymentLinkSummary: ReturnType<
      typeof computeCanonicalUnpaidOnlineReportProjection
    >['paymentLinkSummary'];
  }> {
    const rows = await this.listUnpaidCollectionOrders(branchId, actor);
    const projection = computeCanonicalUnpaidOnlineReportProjection(rows);
    return {
      rows,
      paymentLinkRows: projection.paymentLinkRowIndexes
        .slice(0, 50)
        .map((index) => rows[index])
        .filter((row): row is (typeof rows)[number] => Boolean(row)),
      branchSummaries: projection.branchSummaries,
      paymentLinkSummary: projection.paymentLinkSummary,
    };
  }

  /**
   * V1.7.4 — Market-debt aggregate that mirrors the widened Collections
   * list (`listUnpaidCollectionOrders`). Returns the single Decimal sum
   * the Red KPI card displays, so the table footer and the card always
   * match to the last fils. Kept as a dedicated helper because the KPI
   * is called on every Operations-Summary poll and building the full
   * row projection (with line items, reminders, WhatsApp locks, etc.)
   * would be wasted work.
   *
   * Scope semantics match the list:
   *   - `driverId === userId`           when the caller is a DRIVER,
   *   - driver.branchId | customer.originBranchId when a MANAGER or a
   *     branch filter is set,
   *   - global otherwise.
   *
   * Membership:
   *   - `cashStatus = UNPAID` (pending hosted-link / cash arrears), OR
   *   - `posPaymentMethod = DEBT_ON_ACCOUNT` with still-open FIFO debt
   *     (resolved via the Accountant-canonical ledger allocation).
   */
  async sumCollectionsDebtTotalKd(
    branchId: string | null = null,
    actor?: JwtUser,
  ): Promise<Prisma.Decimal> {
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

    const [unpaidAgg, debtCandidates] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          cashStatus: CashStatus.UNPAID,
          status: { not: OrderStatus.CANCELED },
          ...(branchWhere ?? {}),
        },
        _sum: { totalPrice: true },
      }),
      this.prisma.order.findMany({
        where: {
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
          status: { not: OrderStatus.CANCELED },
          NOT: { cashStatus: CashStatus.UNPAID },
          ...(branchWhere ?? {}),
        },
        select: { id: true, customerId: true, totalPrice: true },
      }),
    ]);

    const openDebtOrderIds = await this.resolveOpenDebtOrderIds(
      debtCandidates.map((d) => ({
        orderId: d.id,
        customerId: d.customerId,
      })),
    );
    const debtOpenTotal = debtCandidates
      .filter((d) => openDebtOrderIds.has(d.id))
      .reduce(
        (acc, d) => acc.plus(d.totalPrice),
        new Prisma.Decimal(0),
      );

    return (unpaidAgg._sum.totalPrice ?? new Prisma.Decimal(0)).plus(
      debtOpenTotal,
    );
  }

  /**
   * V20.3.1 — partial-payment-aware red KPI.
   *
   * Returns Σ(remaining_balance) over every order that contributes
   * to the Collections / red-debt scope. Differs from
   * {@link sumCollectionsDebtTotalKd} which sums gross
   * `Order.totalPrice` and therefore overstates exposure for any
   * invoice with prior partial payments.
   *
   * Migration plan: dashboards / red KPI / Outstanding header
   * should call this method. The legacy `sumCollectionsDebtTotalKd`
   * stays in place to avoid forcing every consumer to migrate at
   * once. When `V20_3_TRUE_ACCOUNTING=true` the canonical debt
   * value is the journal AR balance — see
   * `JournalSourceService.getCustomerDebtFromJournalAR()` for the
   * per-customer breakdown — but the per-order red KPI still
   * derives from the DebtLedger waterfall here so the operator
   * panel can drill from "red total" to "list of open invoices".
   */
  async sumCollectionsDebtRemainingKd(
    branchId: string | null = null,
    actor?: JwtUser,
  ): Promise<Prisma.Decimal> {
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
        status: { not: OrderStatus.CANCELED },
        OR: [
          { cashStatus: CashStatus.UNPAID },
          { posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT },
          { posPaymentMethod: PosPaymentMethod.ONLINE },
          { posPaymentMethod: PosPaymentMethod.PAYMENT_LINK },
        ],
        ...(branchWhere ?? {}),
      },
      select: {
        id: true,
        customerId: true,
        totalPrice: true,
        cashStatus: true,
        posPaymentMethod: true,
      },
    });
    if (rows.length === 0) return new Prisma.Decimal(0);

    const debtCandidates = rows.filter(
      (r) => r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT,
    );
    const openDebtOrderIds = await this.resolveOpenDebtOrderIds(
      debtCandidates.map((d) => ({
        orderId: d.id,
        customerId: d.customerId,
      })),
    );

    const inScope = rows.filter((r) => {
      if (r.cashStatus === CashStatus.UNPAID) return true;
      if (
        r.posPaymentMethod === PosPaymentMethod.ONLINE ||
        r.posPaymentMethod === PosPaymentMethod.PAYMENT_LINK
      ) {
        return true;
      }
      if (r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT) {
        return openDebtOrderIds.has(r.id);
      }
      return false;
    });
    if (inScope.length === 0) return new Prisma.Decimal(0);

    const remainingByOrder = await computeOrderRemainingBalancesBatch(
      this.prisma,
      inScope.map((r) => r.id),
    );
    const tol = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);
    let total = new Prisma.Decimal(0);
    for (const r of inScope) {
      const rem = remainingByOrder.get(r.id) ?? r.totalPrice;
      if (rem.lessThanOrEqualTo(tol)) continue;
      total = total.plus(rem);
    }
    return total;
  }

  /**
   * Minimal order rows feeding AR / Outstanding grouping — **same membership**
   * as {@link listUnpaidCollectionOrders} (`filteredRows`). Optional bounds
   * narrow the set for UI filters; omit `createdAt` for all-time (aligns with
   * {@link sumCollectionsDebtTotalKd} / red KPI).
   */
  async listCollectionsReceivableAggOrders(args: {
    branchId: string | null;
    actor?: JwtUser;
    createdAt?: { gte?: Date; lte?: Date };
    driverId?: string;
    customerId?: string;
  }): Promise<
    Array<{
      id: string;
      customerId: string;
      driverId: string | null;
      totalPrice: Prisma.Decimal;
      createdAt: Date;
      dueDate: Date | null;
    }>
  > {
    const { branchId, actor, createdAt, driverId, customerId } = args;
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

    const createdFilter =
      createdAt && (createdAt.gte || createdAt.lte)
        ? ({
            createdAt: {
              ...(createdAt.gte ? { gte: createdAt.gte } : {}),
              ...(createdAt.lte ? { lte: createdAt.lte } : {}),
            },
          } satisfies Prisma.OrderWhereInput)
        : {};

    const rows = await this.prisma.order.findMany({
      where: {
        status: { not: OrderStatus.CANCELED },
        OR: [
          { cashStatus: CashStatus.UNPAID },
          { posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT },
          { posPaymentMethod: PosPaymentMethod.ONLINE },
          { posPaymentMethod: PosPaymentMethod.PAYMENT_LINK },
        ],
        ...(branchWhere ?? {}),
        ...createdFilter,
        ...(driverId ? { driverId } : {}),
        ...(customerId ? { customerId } : {}),
      },
      select: {
        id: true,
        customerId: true,
        driverId: true,
        totalPrice: true,
        cashStatus: true,
        posPaymentMethod: true,
        createdAt: true,
        dueDate: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const debtCandidates = rows.filter(
      (r) => r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT,
    );
    const openDebtOrderIds = await this.resolveOpenDebtOrderIds(
      debtCandidates.map((r) => ({ orderId: r.id, customerId: r.customerId })),
    );
    const remainingByOrder = await computeOrderRemainingBalancesBatch(
      this.prisma,
      rows.map((r) => r.id),
    );
    const tol = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);

    return rows
      .filter((r) => {
        const rem = remainingByOrder.get(r.id) ?? r.totalPrice;
        if (rem.lessThanOrEqualTo(tol)) return false;
        if (r.cashStatus === CashStatus.UNPAID) return true;
        if (
          r.posPaymentMethod === PosPaymentMethod.ONLINE ||
          r.posPaymentMethod === PosPaymentMethod.PAYMENT_LINK
        ) {
          return true;
        }
        if (r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT) {
          return openDebtOrderIds.has(r.id);
        }
        return false;
      })
      .map((r) => ({
        id: r.id,
        customerId: r.customerId,
        driverId: r.driverId,
        totalPrice: r.totalPrice,
        createdAt: r.createdAt,
        dueDate: r.dueDate,
      }));
  }

  /**
   * Whether an order contributes to the Collections / market-debt totals for
   * a customer — **byte-identical** to the filter in {@link listUnpaidCollectionOrders}
   * (`filteredRows`). UNPAID rows always count; DEBT_ON_ACCOUNT rows only while
   * FIFO says the invoice is still open.
   */
  private isOrderInCollectionsUncollectedScope(
    r: {
      id: string;
      cashStatus: CashStatus;
      posPaymentMethod: PosPaymentMethod | null;
    },
    debtOnAccountStillOpenIds: Set<string>,
  ): boolean {
    if (r.cashStatus === CashStatus.UNPAID) return true;
    if (
      r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT &&
      debtOnAccountStillOpenIds.has(r.id)
    ) {
      return true;
    }
    return false;
  }

  /**
   * Single DB pass: total KD + order ids that count as Collections debt for
   * this customer (same filter as {@link listUnpaidCollectionOrders}).
   */
  async getCollectionsReceivableSnapshotForCustomer(
    customerId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{
    totalKd: Prisma.Decimal;
    /**
     * V20.3.1 — Σ(remaining_balance) over the same in-scope rows.
     * Differs from `totalKd` whenever an in-scope invoice has prior
     * partial payments. Use this for red KPI / Outstanding header /
     * collections views; `totalKd` is preserved for callers that
     * still need the gross figure.
     */
    remainingKd: Prisma.Decimal;
    openOrderIds: Set<string>;
  }> {
    const db = tx ?? this.prisma;
    const rows = await db.order.findMany({
      where: {
        customerId,
        status: { not: OrderStatus.CANCELED },
        OR: [
          { cashStatus: CashStatus.UNPAID },
          { posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT },
        ],
      },
      select: {
        id: true,
        customerId: true,
        totalPrice: true,
        cashStatus: true,
        posPaymentMethod: true,
      },
    });
    const debtCandidates = rows.filter(
      (r) => r.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT,
    );
    const openDebtOrderIds = await this.resolveOpenDebtOrderIds(
      debtCandidates.map((r) => ({
        orderId: r.id,
        customerId: r.customerId,
      })),
      db,
    );
    let totalKd = new Prisma.Decimal(0);
    const openOrderIds = new Set<string>();
    const inScopeIds: string[] = [];
    for (const r of rows) {
      if (!this.isOrderInCollectionsUncollectedScope(r, openDebtOrderIds)) {
        continue;
      }
      totalKd = totalKd.plus(r.totalPrice);
      openOrderIds.add(r.id);
      inScopeIds.push(r.id);
    }
    let remainingKd = new Prisma.Decimal(0);
    if (inScopeIds.length > 0) {
      const remainingByOrder = await computeOrderRemainingBalancesBatch(
        db,
        inScopeIds,
      );
      const tol = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);
      for (const id of inScopeIds) {
        const rem = remainingByOrder.get(id);
        if (!rem || rem.lessThanOrEqualTo(tol)) continue;
        remainingKd = remainingKd.plus(rem);
      }
    }
    return { totalKd, remainingKd, openOrderIds };
  }

  /**
   * Σ `totalPrice` for every non-canceled invoice for this customer that would
   * appear on `/collections` (الفواتير غير المحصّلة) — same scope as
   * {@link sumCollectionsDebtTotalKd} but for one `customerId`.
   */
  async sumCollectionsReceivableKdForCustomer(
    customerId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Prisma.Decimal> {
    const { totalKd } =
      await this.getCollectionsReceivableSnapshotForCustomer(customerId, tx);
    return totalKd;
  }

  /**
   * Operational debt basis for subscriber totals, Call Center conversion /
   * partial-pay copy, and `activateSubscriptionPlan`.
   *
   * This is NOT the canonical financial number for Customer 360. Canonical
   * customer financial totals come only from `computeCustomerFinancials()`.
   *
   * - **`operationalDebtKd`**: **أعلى** القيم الثلاث حتى لا يظهر رقم أقل من أي
   *   مرجع يعتمد عليه الموظف:
   *   1) صافي أستاذ الديون (`DebtLedgerEntry`، نفس شلال «ذمم دفتر الالتزام»)،
   *   2) `getCustomerDebtSnapshot.totalDebt` (دين المحفظة + زيادة استعمال الاشتراك)،
   *   3) مجموع نطاق التحصيل التقليدي: `wallet.debt + Σ` فواتير التحصيل
   *      ({@link getCollectionsReceivableSnapshotForCustomer}) — يطابق الصفوف في
   *      «تقرير تتبع الديون» عندما تُجمع ذمم الفواتير مع عمود المحفظة.
   * - **`collectionsReceivableKd`**: `max(operationalDebtKd − walletDebtKd, 0)`.
   *
   * Pass `embeddedWalletDebt` when `customer.wallet` is already loaded so the
   * wallet row cannot diverge from the serialized `debt` column.
   */
  async getOperationalDebtKdBreakdown(
    customerId: string,
    embeddedWalletDebt?: Prisma.Decimal | null,
    tx?: Prisma.TransactionClient,
  ): Promise<{
    walletDebtKd: Prisma.Decimal;
    collectionsReceivableKd: Prisma.Decimal;
    operationalDebtKd: Prisma.Decimal;
    collectionsOpenOrderIds: Set<string>;
    /** Present when env `EXPOSE_DEBT_BREAKDOWN=1`: three inputs + winners. */
    trace?: DebtKdBreakdownTrace;
  }> {
    const db = tx ?? this.prisma;
    let walletDebtKd: Prisma.Decimal;
    if (embeddedWalletDebt !== undefined) {
      walletDebtKd =
        embeddedWalletDebt ?? new Prisma.Decimal(0);
    } else {
      const row = await db.customerWallet.findUnique({
        where: { customerId },
        select: { debt: true },
      });
      walletDebtKd = row?.debt ?? new Prisma.Decimal(0);
    }

    const ledgerOpen = await getCustomerNetDebtFromDebtLedgerAgg(db, customerId);
    const snapshotFromWalletKd = await getCustomerDebtSnapshotTotalKd(
      db,
      customerId,
    );
    const collectionsSnap = await this.getCollectionsReceivableSnapshotForCustomer(
      customerId,
      tx,
    );
    const z = new Prisma.Decimal(0);
    const ledgerNetKd = ledgerOpen.netOpenDebtKd;
    /** نفس «قديم effective»: دين المحفظة + ذمم التحصيل الظاهرة في القائمة. */
    const orderMarketScopeKd = walletDebtKd.plus(collectionsSnap.totalKd);

    // V20.1 → V22 — Operational debt double-count fix.
    //
    // Legacy behaviour: `operationalDebtKd = max(ledgerNet, walletSnapshot,
    // walletDebt + Σ Order.totalPrice of open DEBT_ON_ACCOUNT)`. The
    // third term double-counts: `walletDebt` already reflects the
    // post-wallet shortfall, while `collectionsSnap.totalKd` adds the
    // FULL `Order.totalPrice` of every open DEBT_ON_ACCOUNT row. For a
    // customer with walletDebt=30.250 and one open debt-on-account
    // invoice for 30.250, the customer card reported 60.500.
    //
    // V22 makes the ledger/wallet path final because the canonical
    // sources (`DebtLedgerEntry` and the wallet snapshot) already carry
    // the receivable once. The old inflated comparator is fully retired.
    const operationalDebtKd = resolveOperationalDebtKd({
      ledgerNetKd,
      snapshotFromWalletKd,
      orderMarketScopeKd,
    });

    const collectionsReceivableKd = Prisma.Decimal.max(
      operationalDebtKd.sub(walletDebtKd),
      z,
    );

    const unpaidIds = await db.order.findMany({
      where: {
        customerId,
        status: { not: OrderStatus.CANCELED },
        cashStatus: CashStatus.UNPAID,
      },
      select: { id: true },
    });
    const collectionsOpenOrderIds = new Set<string>(collectionsSnap.openOrderIds);
    for (const u of unpaidIds) {
      collectionsOpenOrderIds.add(u.id);
    }

    const expose =
      process.env.EXPOSE_DEBT_BREAKDOWN?.trim().toLowerCase() === '1' ||
      process.env.EXPOSE_DEBT_BREAKDOWN?.trim().toLowerCase() === 'true';
    let trace: DebtKdBreakdownTrace | undefined;
    if (expose) {
      trace = buildDebtKdBreakdownTrace(
        ledgerNetKd,
        snapshotFromWalletKd,
        orderMarketScopeKd,
        operationalDebtKd,
      );
      this.log.warn(
        `[debtKdBreakdown] customerId=${customerId} ledger=${trace.ledgerNetKd} walletSnap=${trace.walletSnapshotKd} orderMarket=${trace.orderMarketScopeKd} operational=${trace.operationalDebtKd} winners=[${trace.winningSources.join(',')}]`,
      );
    }

    return {
      walletDebtKd,
      collectionsReceivableKd,
      operationalDebtKd,
      collectionsOpenOrderIds,
      trace,
    };
  }

  /** Every order id for this customer that is still counted as Collections debt. */
  async getCollectionsOpenOrderIdsForCustomer(
    customerId: string,
  ): Promise<Set<string>> {
    const { openOrderIds } =
      await this.getCollectionsReceivableSnapshotForCustomer(customerId);
    return openOrderIds;
  }

  /**
   * Canonical collections charge for one invoice — matches the amount shown
   * in the CC debt table (`listUnpaidCollectionOrders` → `amountKd`).
   */
  async getCollectionChargeKdForOrder(orderId: string): Promise<string> {
    const rows = await this.listUnpaidCollectionOrders(null, undefined);
    const row = rows.find((r) => r.orderId === orderId);
    if (!row) {
      throw new BadRequestException(
        'Order is not open for collection (settled, canceled, or not found).',
      );
    }
    return row.amountKd;
  }

  /**
   * Itemized open debt for CC «full balance» links — amounts match the
   * collections table; `reasonAr` explains each line for customer trust.
   */
  async getCustomerCollectionDebtBreakdown(customerId: string): Promise<{
    customerId: string;
    customerName: string;
    customerPhone: string;
    totalDebtKd: string;
    lines: Array<{
      orderId: string;
      readableId: string;
      invoiceNumber: string | null;
      amountKd: string;
      paymentMethod: PosPaymentMethod | null;
      orderDateIso: string;
      reasonAr: string;
    }>;
  }> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        displayName: true,
        phone: true,
        phone2: true,
      },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const visible = await this.debtVisibility.getCustomerVisibleDebt(customerId);
    const rows = await this.listUnpaidCollectionOrders(
      null,
      undefined,
      customerId,
    );

    const phone =
      customer.phone?.replace(/[\s-]/g, '').trim() ||
      customer.phone2?.replace(/[\s-]/g, '').trim() ||
      '';

    return {
      customerId: customer.id,
      customerName: customer.displayName?.trim() || phone || 'Customer',
      customerPhone: phone,
      totalDebtKd: visible.remainingDebtKd,
      lines: rows.map((r) => ({
        orderId: r.orderId,
        readableId: r.readableId,
        invoiceNumber: r.invoiceNumber,
        amountKd: r.amountKd,
        paymentMethod: r.paymentMethod,
        orderDateIso: r.createdAtIso,
        reasonAr: collectionDebtReasonAr(
          r.paymentMethod,
          r.createdAtIso,
          r.invoiceNumber,
          r.readableId,
        ),
      })),
    };
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
    let amountKd: string;
    try {
      amountKd = await this.getCollectionChargeKdForOrder(orderId);
    } catch {
      return null;
    }
    const r = await this.prisma.order.findFirst({
      where: {
        id: orderId,
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
      amountKd,
      lineItems,
      branchName,
      driverName,
    };
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
  async listDriverPendingInvoices(userId: string, search?: string | null): Promise<{
    rows: {
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
    }[];
    totalAmountKd: string;
    filteredCount: number;
    totalCount: number;
  }> {
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
    const projected = filtered.map((r) => {
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

      const row = {
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
      return {
        ...row,
        searchableText: [
          row.readableId,
          row.invoiceNumber ?? '',
          row.customerName,
          row.customerPhone,
          row.notes ?? '',
        ].join(' '),
      };
    });
    const result = computeCanonicalDriverPendingInvoiceProjection(projected, search);
    return {
      rows: result.rows.map(({ searchableText: _searchableText, ...row }) => row),
      totalAmountKd: result.totalAmountKd,
      filteredCount: result.filteredCount,
      totalCount: result.totalCount,
    };
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
    {
      id: string;
      fullName: string;
      username: string;
      branchId: string | null;
      branchName: string | null;
    }[]
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
        branchId: true,
        branch: { select: { name: true } },
      },
      orderBy: { fullName: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      username: r.username,
      branchId: r.branchId,
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
    db: PrismaOrderDb = this.prisma,
  ): Promise<Set<string>> {
    const openIds = new Set<string>();
    if (candidates.length === 0) return openIds;

    const orderIds = candidates.map((c) => c.orderId);
    const remainingByOrder = await computeOrderRemainingBalancesBatch(db, orderIds);
    const tol = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);
    for (const { orderId } of candidates) {
      const rem = remainingByOrder.get(orderId) ?? new Prisma.Decimal(0);
      if (rem.greaterThan(tol)) openIds.add(orderId);
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

  /**
   * يعرض الفواتير حسب دور المستخدم: السائق يرى فواتيره، المدير يرى فرعه، وأدوار الإدارة ترى النطاق الكامل.
   * Lists invoices by actor role: drivers see their own, managers see branch rows, and administrative roles see the full scope.
   * @param userId - معرف المستخدم الطالب / Requesting user id
   * @param role - دور المستخدم الطالب / Requesting user role
   * @param branchId - فرع المستخدم عند الحاجة / Actor branch id when applicable
   * @param filters - فلاتر الحالة والسائق والتاريخ والبحث / Status, driver, date, and search filters
   * @returns قائمة الفواتير المسموح رؤيتها مع علامات التحرير / Visible invoice list with edit flags
   */
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
    } else if (!canViewAllOrders(role)) {
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

  /**
   * يجلب فاتورة واحدة بعد تطبيق صلاحيات الرؤية حسب الدور والملكية.
   * Fetches a single invoice after enforcing role and ownership visibility rules.
   * @param id - معرف الفاتورة / Invoice order id
   * @param userId - معرف المستخدم الطالب / Requesting user id
   * @param role - دور المستخدم الطالب / Requesting user role
   * @returns تفاصيل الفاتورة المسموح بها / Authorized order details
   */
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
    if (canViewAllOrders(role)) {
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
    return this.orderPublicInvoices.mintInvoiceShareLink(orderId, publicBaseUrl);
  }

  /**
   * V19.27 — Stream a simple A4 PDF (English labels; numbers match order totals).
   * Moatmt and other clients fetch this URL as `application/pdf` without SPA auth.
   */
  async getPublicInvoicePdfStream(token: string): Promise<{
    stream: PassThrough;
    filename: string;
  }> {
    return this.orderPublicInvoices.getPublicInvoicePdfStream(token);
  }

  /**
   * يفك رمز مشاركة الفاتورة العامة ويعيد بيانات الفاتورة إذا كان التوقيع والغرض صالحين.
   * Verifies a public invoice share token and returns order details when the signature and purpose are valid.
   * @param token - رمز المشاركة الموقع / Signed public invoice token
   * @returns تفاصيل الفاتورة العامة / Public invoice order details
   */
  async getOrderForPublicInvoiceToken(token: string): Promise<OrderDetail> {
    return this.orderPublicInvoices.getOrderForPublicInvoiceToken(token);
  }

  /**
   * يعيّن سائقاً تشغيلياً لفاتورة غير منتهية دون أثر مالي مباشر على المحفظة أو Journal AR.
   * Assigns an operational driver to a non-terminal order without direct wallet or Journal AR effects.
   * @param orderId - معرف الفاتورة / Order id
   * @param dto - بيانات السائق المراد تعيينه / Driver assignment payload
   * @returns تفاصيل الفاتورة بعد التعيين / Updated order details
   */
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

  /**
   * يحدّث حالة أو ملاحظات الفاتورة ضمن صلاحيات السائق أو الإدارة، وقد يطلق تسوية المحفظة وقيود البيع عند الإكمال.
   * Updates order status or notes within driver/admin permissions and may trigger wallet settlement and sale ledger entries on completion.
   * @param orderId - معرف الفاتورة / Order id
   * @param dto - حقول الحالة أو الملاحظات / Status or notes update payload
   * @param userId - معرف المستخدم المنفذ / Acting user id
   * @param role - دور المستخدم المنفذ / Acting user role
   * @returns تفاصيل الفاتورة بعد التعديل / Updated order details
   */
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
    } else if (!canStaffUpdateOrders(role)) {
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
      // Gateway-backed methods stay UNPAID until provider callback confirms
      // settlement. Marking them PAID_ONLINE on delivery completion hides
      // still-unpaid links from Collections follow-up rails.
      const keepUnpaidUntilGateway =
        order.posPaymentMethod === PosPaymentMethod.ONLINE ||
        order.posPaymentMethod === PosPaymentMethod.PAYMENT_LINK;
      if (!keepUnpaidUntilGateway) {
        data.cashStatus = cashStatusForPaymentMethod(order.posPaymentMethod);
      }
    }
    if (dto.status === OrderStatus.COMPLETED && dto.status !== order.status) {
      data.completedAt = new Date();
    }

    const transitionedToCompleted =
      dto.status === OrderStatus.COMPLETED && dto.status !== order.status;
    /** Driver delivery: cash or handheld KNET collected at completion — not link/online gateway. */
    const notifyDriverManualCollection =
      transitionedToCompleted &&
      !order.walletSettledAt &&
      order.cashStatus === CashStatus.UNPAID &&
      (order.posPaymentMethod === PosPaymentMethod.CASH ||
        order.posPaymentMethod === PosPaymentMethod.KNET);

    const updated = await this.prisma.$transaction(
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
        // V25 Ledger Enforcement: emit POS_SALE_COMPLETED when this
        // path transitions the order to COMPLETED — matches what
        // posCheckout and PaymentsService finalize already do so the
        // Unified Ledger / Executive P&L never under-count revenue.
        // Gateway-backed methods (ONLINE / PAYMENT_LINK) are skipped
        // because their revenue is recognised by the gateway callback.
        if (
          transitionedToCompleted &&
          order.posPaymentMethod !== PosPaymentMethod.ONLINE &&
          order.posPaymentMethod !== PosPaymentMethod.PAYMENT_LINK
        ) {
          await this.generalLedger.append(tx, {
            entryType: GeneralLedgerEntryType.POS_SALE_COMPLETED,
            amount: order.totalPrice,
            memo: 'POS checkout (driver/manager completion)',
            orderId,
            customerId: order.customerId,
            actorUserId: userId,
            metadata: {
              posPaymentMethod: order.posPaymentMethod ?? 'CASH',
              source: 'UPDATE_ORDER_COMPLETION',
            },
          });
        }
        return tx.order.findUniqueOrThrow({
          where: { id: orderId },
          select: orderDetailSelect,
        });
      },
      POS_ORDER_INTERACTIVE_TX,
    );

    if (notifyDriverManualCollection) {
      const phone = resolveCustomerPhoneForNotify(
        updated.customer.phone,
        updated.customer.phone2,
      );
      if (phone.trim()) {
        const paymentMethodLabelAr =
          order.posPaymentMethod === PosPaymentMethod.CASH
            ? 'الكاش'
            : 'الكي نت';
        this.customerNotifications.notifyDriverCollectionConfirmed({
          customerPhone: phone,
          orderId: updated.id,
          amountKd: updated.totalPrice.toFixed(3),
          paymentMethodLabelAr,
        });
      }
    }
    if (
      transitionedToCompleted &&
      (updated.posPaymentMethod === PosPaymentMethod.ONLINE ||
        updated.posPaymentMethod === PosPaymentMethod.PAYMENT_LINK)
    ) {
      try {
        await this.autoSendDirectPaymentLink(updated);
      } catch (e) {
        this.log.warn(`auto direct payment-link send failed (updateOrder): ${e}`);
      }
    }

    return updated;
  }

  /**
   * يجمع لوحة المدير التشغيلية من الطلبات النشطة وإيرادات الطلبات المكتملة ومساهمة السائقين.
   * Aggregates the manager dashboard from active orders, completed-order revenue, and driver contribution metrics.
   * @returns مؤشرات لوحة المدير / Manager dashboard metrics
   */
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
