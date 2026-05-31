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
import { computeCanonicalDriverPendingInvoiceProjection } from '../finance/canonical-financial-projection';
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
} from './order-types';
import { OrderCustomerNotificationService } from './order-customer-notification.service';
import { OrderPublicInvoiceService } from './order-public-invoice.service';
import { OrderCollectionsReadService } from './order-collections-read.service';
import { PassThrough } from 'node:stream';

export { orderDetailSelect } from './order-selects';
export type { OrderDetail } from './order-types';
export { resolveOperationalDebtKd } from './order-operational-debt.util';

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
    private readonly collectionsRead: OrderCollectionsReadService,
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
   * Phase 3 facade → {@link OrderCollectionsReadService}. Signatures and return
   * types are preserved so every external consumer (call-center, subscribers,
   * outstanding, customer-ledger, controllers) is unchanged.
   */
  listUnpaidCollectionOrders(
    branchId: string | null = null,
    actor?: JwtUser,
    customerId?: string,
  ): ReturnType<OrderCollectionsReadService['listUnpaidCollectionOrders']> {
    return this.collectionsRead.listUnpaidCollectionOrders(
      branchId,
      actor,
      customerId,
    );
  }

  listUnpaidCollectionOrdersReport(
    branchId: string | null = null,
    actor?: JwtUser,
  ): ReturnType<
    OrderCollectionsReadService['listUnpaidCollectionOrdersReport']
  > {
    return this.collectionsRead.listUnpaidCollectionOrdersReport(
      branchId,
      actor,
    );
  }

  sumCollectionsDebtTotalKd(
    branchId: string | null = null,
    actor?: JwtUser,
  ): Promise<Prisma.Decimal> {
    return this.collectionsRead.sumCollectionsDebtTotalKd(branchId, actor);
  }

  sumCollectionsDebtRemainingKd(
    branchId: string | null = null,
    actor?: JwtUser,
  ): Promise<Prisma.Decimal> {
    return this.collectionsRead.sumCollectionsDebtRemainingKd(branchId, actor);
  }

  listCollectionsReceivableAggOrders(args: {
    branchId: string | null;
    actor?: JwtUser;
    createdAt?: { gte?: Date; lte?: Date };
    driverId?: string;
    customerId?: string;
  }): ReturnType<
    OrderCollectionsReadService['listCollectionsReceivableAggOrders']
  > {
    return this.collectionsRead.listCollectionsReceivableAggOrders(args);
  }

  getCollectionsReceivableSnapshotForCustomer(
    customerId: string,
    tx?: Prisma.TransactionClient,
  ): ReturnType<
    OrderCollectionsReadService['getCollectionsReceivableSnapshotForCustomer']
  > {
    return this.collectionsRead.getCollectionsReceivableSnapshotForCustomer(
      customerId,
      tx,
    );
  }

  sumCollectionsReceivableKdForCustomer(
    customerId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Prisma.Decimal> {
    return this.collectionsRead.sumCollectionsReceivableKdForCustomer(
      customerId,
      tx,
    );
  }

  getOperationalDebtKdBreakdown(
    customerId: string,
    embeddedWalletDebt?: Prisma.Decimal | null,
    tx?: Prisma.TransactionClient,
  ): ReturnType<
    OrderCollectionsReadService['getOperationalDebtKdBreakdown']
  > {
    return this.collectionsRead.getOperationalDebtKdBreakdown(
      customerId,
      embeddedWalletDebt,
      tx,
    );
  }

  getCollectionsOpenOrderIdsForCustomer(
    customerId: string,
  ): Promise<Set<string>> {
    return this.collectionsRead.getCollectionsOpenOrderIdsForCustomer(
      customerId,
    );
  }

  getCollectionChargeKdForOrder(orderId: string): Promise<string> {
    return this.collectionsRead.getCollectionChargeKdForOrder(orderId);
  }

  getCustomerCollectionDebtBreakdown(
    customerId: string,
  ): ReturnType<
    OrderCollectionsReadService['getCustomerCollectionDebtBreakdown']
  > {
    return this.collectionsRead.getCustomerCollectionDebtBreakdown(customerId);
  }

  getUnpaidCollectionOrderRowForWhatsappText(
    orderId: string,
  ): ReturnType<
    OrderCollectionsReadService['getUnpaidCollectionOrderRowForWhatsappText']
  > {
    return this.collectionsRead.getUnpaidCollectionOrderRowForWhatsappText(
      orderId,
    );
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
    const openDebtOrderIds = await this.collectionsRead.resolveOpenDebtOrderIds(
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

  /** Phase 3 facade → {@link OrderCollectionsReadService}. */
  sumUnpaidCollectionAmount(): Promise<Prisma.Decimal> {
    return this.collectionsRead.sumUnpaidCollectionAmount();
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
