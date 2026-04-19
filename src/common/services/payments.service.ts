import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CashStatus,
  GeneralLedgerEntryType,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
  SafariRole,
} from '@prisma/client';
import {
  CustomerLedgerService,
  type OrderWalletSettlementPrefetch,
} from '../../customer-ledger/customer-ledger.service';
import { GeneralLedgerService } from '../../general-ledger/general-ledger.service';
import { InventoryService } from '../../inventory/inventory.service';
import { PrismaService } from '../../prisma/prisma.service';

export type CreatePaymentLinkParams = {
  orderId: string;
  amount: Prisma.Decimal;
  customerPhone: string;
};

export type CreatePaymentLinkResult = {
  url: string;
  reference?: string;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly apiBase: string;
  private readonly apiKey: string;
  private readonly merchantId: string;
  private readonly secret: string;
  private readonly callbackPublicUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly customerLedger: CustomerLedgerService,
    private readonly generalLedger: GeneralLedgerService,
    private readonly inventory: InventoryService,
  ) {
    this.apiBase = (process.env.PAYMENTS_API_BASE_URL ?? '').replace(
      /\/$/,
      '',
    );
    this.apiKey = process.env.PAYMENTS_API_KEY ?? '';
    this.merchantId = process.env.PAYMENTS_MERCHANT_ID ?? '';
    this.secret = process.env.PAYMENTS_SECRET ?? '';
    this.callbackPublicUrl = (process.env.PAYMENTS_CALLBACK_PUBLIC_URL ?? '')
      .replace(/\/$/, '');
  }

  /** PAYMENTS_MOCK=true /1 / yes */
  paymentsMockExplicit(): boolean {
    const m = process.env.PAYMENTS_MOCK?.trim().toLowerCase();
    return m === '1' || m === 'true' || m === 'yes';
  }

  /** No gateway base URL → use in-process mock checkout (local dev). */
  usePlaceholderGateway(): boolean {
    return !this.apiBase.trim();
  }

  /** Mock HTML page + unsigned dev callback allowed. */
  isPublicMockCheckoutAvailable(): boolean {
    return this.paymentsMockExplicit() || this.usePlaceholderGateway();
  }

  allowDevMockCallback(body: { devMock?: boolean }): boolean {
    return Boolean(body.devMock) && this.isPublicMockCheckoutAvailable();
  }

  /**
   * Calls Kuwait Gateway (or compatible) API to create a hosted payment URL.
   * Contract is normalized; adjust paths/body to match your provider’s docs.
   */
  async createPaymentLink(
    params: CreatePaymentLinkParams,
  ): Promise<CreatePaymentLinkResult> {
    if (this.isPublicMockCheckoutAvailable()) {
      const base = (
        process.env.PUBLIC_API_URL ?? 'http://localhost:3000'
      ).replace(/\/$/, '');
      const url = `${base}/api/payments/mock-checkout?orderId=${encodeURIComponent(params.orderId)}`;
      this.logger.log(
        `Mock payment link for ${params.orderId} (set PAYMENTS_API_BASE_URL for production gateway)`,
      );
      return { url, reference: 'mock' };
    }

    if (!this.apiKey || !this.merchantId) {
      throw new ServiceUnavailableException(
        'Payment link is not configured (PAYMENTS_API_BASE_URL, PAYMENTS_API_KEY, PAYMENTS_MERCHANT_ID)',
      );
    }

    const callbackUrl = this.callbackPublicUrl
      ? `${this.callbackPublicUrl}/api/payments/callback`
      : `${process.env.PUBLIC_API_URL ?? 'http://localhost:3000'}/api/payments/callback`;

    const body = {
      merchantId: this.merchantId,
      reference: params.orderId,
      orderId: params.orderId,
      amount: params.amount.toFixed(4),
      currency: 'KWD',
      customerPhone: normalizeKwPhone(params.customerPhone),
      callbackUrl,
    };

    const res = await fetch(`${this.apiBase}/v1/payment-links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'X-Merchant-Id': this.merchantId,
        'X-Signature': this.signPayload(JSON.stringify(body)),
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let json: { url?: string; link?: string; reference?: string; id?: string };
    try {
      json = text ? (JSON.parse(text) as typeof json) : {};
    } catch {
      throw new BadRequestException(
        'Payments gateway returned a non-JSON response',
      );
    }

    if (!res.ok) {
      throw new BadRequestException(
        `Payments gateway error (${res.status}): ${text.slice(0, 500)}`,
      );
    }

    const url = json.url ?? json.link;
    if (!url || typeof url !== 'string') {
      throw new BadRequestException(
        'Payments gateway response missing payment URL',
      );
    }

    return {
      url,
      reference: json.reference ?? json.id,
    };
  }

  /** HMAC for outbound requests (if gateway requires it). */
  private signPayload(payload: string): string {
    return createHmac('sha256', this.secret || this.apiKey)
      .update(payload)
      .digest('hex');
  }

  /**
   * Verifies callback `signature` = HMAC-SHA256(secret, `${orderId}|${status}|${amount}`) hex.
   * Align with Kuwait Gateway docs when integrating production.
   */
  verifyIntegratedCallback(dto: {
    orderId: string;
    status: string;
    amount?: string;
    signature?: string;
  }): boolean {
    if (!this.secret) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error('PAYMENTS_SECRET is required in production');
        return false;
      }
      this.logger.warn(
        'PAYMENTS_SECRET missing — callback signature not verified (dev only)',
      );
      return true;
    }
    if (!dto.signature) {
      return false;
    }
    const payload = `${dto.orderId}|${dto.status}|${dto.amount ?? ''}`;
    const expected = createHmac('sha256', this.secret)
      .update(payload)
      .digest('hex');
    try {
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(dto.signature, 'utf8');
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  normalizeCallbackStatus(status: string): 'success' | 'failed' {
    const s = status.trim().toLowerCase();
    if (
      s === 'success' ||
      s === 'paid' ||
      s === 'completed' ||
      s === 'captured'
    ) {
      return 'success';
    }
    return 'failed';
  }

  /**
   * V1.6.0 — Universal payment link for ANY unpaid non-canceled order.
   *
   * Returns the existing `posHostedPaymentUrl` if one was already generated
   * (idempotent + safe to call from the "Payment link" button on the
   * Collections page). Otherwise calls the gateway to mint a new link and
   * persists it on the order row before returning.
   *
   * Does NOT flip `posPaymentMethod` yet — the method auto-switches to
   * `ONLINE` only when the gateway callback confirms a successful payment
   * (see `finalizeSinglePaidOrderFromGateway`). Until then the order keeps
   * its original method so the Collections table still shows it correctly.
   */
  async ensurePaymentLinkForUnpaidOrder(
    orderId: string,
  ): Promise<CreatePaymentLinkResult> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        cashStatus: true,
        totalPrice: true,
        walletSettledAt: true,
        posHostedPaymentUrl: true,
        customer: { select: { phone: true, phone2: true } },
      },
    });
    if (!order) {
      throw new BadRequestException('Order not found');
    }
    if (order.status === OrderStatus.CANCELED) {
      throw new BadRequestException('Order is canceled');
    }
    if (order.cashStatus !== CashStatus.UNPAID || order.walletSettledAt) {
      throw new BadRequestException('Order is already paid');
    }
    if (order.posHostedPaymentUrl) {
      return { url: order.posHostedPaymentUrl };
    }
    const phone =
      order.customer.phone?.trim() || order.customer.phone2?.trim() || '';
    const link = await this.createPaymentLink({
      orderId: order.id,
      amount: order.totalPrice,
      customerPhone: phone,
    });
    await this.prisma.order.update({
      where: { id: order.id },
      data: { posHostedPaymentUrl: link.url },
    });
    return link;
  }

  /**
   * After gateway confirms payment: complete order + wallet settlement (same as instant POS).
   * `referenceId` may be a single order id, or a PosPaymentBundle id (multi-invoice POS).
   */
  async finalizePaidOrderFromGateway(referenceId: string): Promise<void> {
    const bundle = await this.prisma.posPaymentBundle.findUnique({
      where: { id: referenceId },
      include: {
        orders: {
          where: { status: OrderStatus.PENDING },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        },
      },
    });

    if (bundle?.orders.length) {
      for (const o of bundle.orders) {
        await this.finalizeSinglePaidOrderFromGateway(o.id);
      }
      return;
    }

    await this.finalizeSinglePaidOrderFromGateway(referenceId);
  }

  private async finalizeSinglePaidOrderFromGateway(orderId: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: {
            id: true,
            status: true,
            cashStatus: true,
            walletSettledAt: true,
            customerId: true,
            totalPrice: true,
            posPaymentMethod: true,
            driverId: true,
          },
        });
        if (!order) {
          throw new BadRequestException('Order not found');
        }
        if (order.walletSettledAt) {
          // Idempotent — already settled (likely a replayed webhook).
          return;
        }
        if (order.status === OrderStatus.CANCELED) {
          throw new BadRequestException(
            'Order is canceled — cannot finalize a link payment for it',
          );
        }

        // V1.6.2 — every gateway-finalized order reached this point by
        // definition from the UNPAID bucket (we passed the walletSettledAt
        // guard and the cashStatus check upstream). That means EVERY row
        // we write here counts as "debt collected today", regardless of
        // whether the original method was CASH, KNET, DEBT_ON_ACCOUNT,
        // PAYMENT_LINK, or ONLINE. Tagging was previously conditional on
        // `originalMethod !== ONLINE && !== PAYMENT_LINK`, which silently
        // excluded first-time POS online sales and pre-minted link orders
        // from the Green card — that's the "Red went down but Green
        // stayed 0" bug.
        const originalMethod = order.posPaymentMethod;

        const completedAt = new Date();
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.COMPLETED,
            cashStatus: CashStatus.PAID_TO_DRIVER,
            completedAt,
            posPaymentMethod: PosPaymentMethod.ONLINE,
            walletSettledAt: null,
          },
        });

        // A driver may not exist on orders that were booked through the
        // office (e.g. Cash-on-account invoices later paid online). Fall
        // back to a deterministic performer so the settlement row is
        // always attributable.
        const performerId = order.driverId ?? (await this.resolveFallbackPerformer(tx));
        if (!performerId) {
          throw new BadRequestException(
            'No performer available to attribute the link payment to',
          );
        }

        const prefetch: OrderWalletSettlementPrefetch = {
          customerId: order.customerId,
          totalPrice: order.totalPrice,
          // Pass the *new* method so the wallet math treats this as
          // "external covers shortfall" (matches a regular ONLINE sale).
          posPaymentMethod: PosPaymentMethod.ONLINE,
          walletSettledAt: null,
          skipPerformerLookup: true,
        };

        const extraMetadata: Record<string, Prisma.JsonValue> = {
          // These four keys are what the "Collected Today" KPI and the
          // Accountant's Unified-Ledger reports read from. `debtSettled`
          // is the magic key the green card sums; it MUST be a string so
          // `extractDebtSettled()` picks it up.
          debtSettled: order.totalPrice.toString(),
          debtSettlementViaLink: true,
          originalPaymentMethod: originalMethod ?? null,
          reportingCategory: 'DEBT_COLLECTION_VIA_LINK',
        };

        await this.customerLedger.applyOrderWalletSettlementForCompletedOrder(
          tx,
          orderId,
          performerId,
          prefetch,
          extraMetadata,
        );

        // A3.D1 — every gateway-finalized order is a real revenue event
        // and must land in the GL just like instant POS checkout. Without
        // this append, the Unified Ledger stream silently undercounts
        // revenue vs. the Executive P&L (which reads `Order.totalPrice`
        // on `completedAt`). See docs/DUSTUR_TASHGHIL_SAFARI.md §1.
        await this.generalLedger.append(tx, {
          entryType: GeneralLedgerEntryType.POS_SALE_COMPLETED,
          amount: order.totalPrice,
          memo: 'POS checkout (hosted link)',
          orderId,
          customerId: order.customerId,
          actorUserId: performerId,
          metadata: {
            posPaymentMethod: PosPaymentMethod.ONLINE,
            originalPaymentMethod: originalMethod ?? null,
            source: 'GATEWAY_CALLBACK',
          },
        });

        // Dastur §7 — gateway completion also emits the STOCK_OUT
        // side-effects. For driver-less office invoices the fallback
        // performer has no branch, so the helper silently no-ops.
        const actorRow = await tx.user.findUnique({
          where: { id: performerId },
          select: { branchId: true },
        });
        const driverRow = order.driverId
          ? await tx.user.findUnique({
              where: { id: order.driverId },
              select: { branchId: true },
            })
          : null;
        await this.inventory.applyOrderStockDecrement(tx, {
          orderId,
          actorUserId: performerId,
          branchId: driverRow?.branchId ?? actorRow?.branchId ?? null,
          reference: `GATEWAY-${orderId.slice(0, 8)}`,
        });
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  }

  /**
   * V1.6.0 — when an office/call-center link payment lands for an order
   * that was never assigned to a driver (e.g. pure debt collection on a
   * DEBT_ON_ACCOUNT invoice), pick the first OWNER we find so the ledger
   * row has a valid `performedById`. Deterministic and cheap — called at
   * most once per link callback.
   */
  private async resolveFallbackPerformer(
    tx: Prisma.TransactionClient,
  ): Promise<string | null> {
    const owner = await tx.user.findFirst({
      where: { safariRole: SafariRole.OWNER },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return owner?.id ?? null;
  }

  /**
   * V1.6.9 — Call Center "تم الدفع" manual confirmation.
   *
   * Mirrors `finalizeSinglePaidOrderFromGateway` except the final
   * `posPaymentMethod` comes from the agent (CASH | KNET | PAYMENT_LINK
   * | ONLINE) instead of being hard-coded to ONLINE, and the performer
   * is the Call Center agent that pressed the button (falls back to the
   * assigned driver, then the owner, so the ledger row always attributes
   * cleanly).
   *
   * Idempotent: if the order was already settled (`walletSettledAt`
   * set) we just return the current snapshot. If the order is canceled
   * we throw — you cannot mark a canceled order as paid.
   */
  async manuallyMarkOrderPaidByMethod(args: {
    orderId: string;
    method: Exclude<
      PosPaymentMethod,
      'SUBSCRIPTION_WALLET' | 'DEBT_ON_ACCOUNT'
    >;
    performedByUserId: string;
  }): Promise<{
    orderId: string;
    alreadySettled: boolean;
    amountKd: string;
    posPaymentMethod: PosPaymentMethod;
  }> {
    const { orderId, method, performedByUserId } = args;
    return this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: {
            id: true,
            status: true,
            cashStatus: true,
            walletSettledAt: true,
            customerId: true,
            totalPrice: true,
            posPaymentMethod: true,
            driverId: true,
          },
        });
        if (!order) {
          throw new BadRequestException('Order not found');
        }
        if (order.status === OrderStatus.CANCELED) {
          throw new BadRequestException(
            'Order is canceled — cannot mark it as paid',
          );
        }
        if (order.walletSettledAt) {
          // Idempotent — the order is already settled. Return the
          // current snapshot so the UI can refresh without error.
          return {
            orderId: order.id,
            alreadySettled: true,
            amountKd: order.totalPrice.toFixed(3),
            posPaymentMethod:
              order.posPaymentMethod ?? PosPaymentMethod.CASH,
          };
        }

        const originalMethod = order.posPaymentMethod;
        const completedAt = new Date();
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.COMPLETED,
            cashStatus: CashStatus.PAID_TO_DRIVER,
            completedAt,
            posPaymentMethod: method,
            walletSettledAt: null,
          },
        });

        // Prefer the agent so the ledger row is attributable to the
        // human who pressed the button. Fall back to the driver (if any)
        // and finally to an owner so we never fail for driver-less
        // DEBT_ON_ACCOUNT invoices collected by the office.
        const performerId =
          performedByUserId ??
          order.driverId ??
          (await this.resolveFallbackPerformer(tx));
        if (!performerId) {
          throw new BadRequestException(
            'No performer available to attribute the manual settlement to',
          );
        }

        const prefetch: OrderWalletSettlementPrefetch = {
          customerId: order.customerId,
          totalPrice: order.totalPrice,
          // Tell the wallet math to treat the settlement as "external
          // covers shortfall" so we do NOT add invoice debt for methods
          // that actually close the invoice (CASH/KNET/PAYMENT_LINK/
          // ONLINE). DEBT_ON_ACCOUNT and SUBSCRIPTION_WALLET are not in
          // the accepted `method` set and thus can never reach here.
          posPaymentMethod: method,
          walletSettledAt: null,
          skipPerformerLookup: true,
        };

        const extraMetadata: Record<string, Prisma.JsonValue> = {
          debtSettled: order.totalPrice.toString(),
          debtSettlementViaCallCenter: true,
          originalPaymentMethod: originalMethod ?? null,
          confirmedPaymentMethod: method,
          reportingCategory: 'DEBT_COLLECTION_MANUAL',
        };

        await this.customerLedger.applyOrderWalletSettlementForCompletedOrder(
          tx,
          orderId,
          performerId,
          prefetch,
          extraMetadata,
        );

        // A3.D1 — Call-Center "mark as paid" is also a real revenue event;
        // mirror the GL write that instant POS checkout performs so the
        // Unified Ledger + Executive P&L stay aligned.
        await this.generalLedger.append(tx, {
          entryType: GeneralLedgerEntryType.POS_SALE_COMPLETED,
          amount: order.totalPrice,
          memo: 'POS checkout (call-center manual)',
          orderId,
          customerId: order.customerId,
          actorUserId: performerId,
          metadata: {
            posPaymentMethod: method,
            originalPaymentMethod: originalMethod ?? null,
            source: 'CALL_CENTER_MANUAL',
          },
        });

        // Dastur §7 — also emit STOCK_OUT on call-center manual
        // completion. Branch priority: driver → agent → none.
        const actorRow = await tx.user.findUnique({
          where: { id: performerId },
          select: { branchId: true },
        });
        const driverRow = order.driverId
          ? await tx.user.findUnique({
              where: { id: order.driverId },
              select: { branchId: true },
            })
          : null;
        await this.inventory.applyOrderStockDecrement(tx, {
          orderId,
          actorUserId: performerId,
          branchId: driverRow?.branchId ?? actorRow?.branchId ?? null,
          reference: `MANUAL-${orderId.slice(0, 8)}`,
        });

        return {
          orderId: order.id,
          alreadySettled: false,
          amountKd: order.totalPrice.toFixed(3),
          posPaymentMethod: method,
        };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  }
}

function normalizeKwPhone(phone: string): string {
  const d = phone.replace(/[\s-]/g, '').trim();
  if (d.startsWith('+')) {
    return d;
  }
  if (d.startsWith('965')) {
    return `+${d}`;
  }
  if (d.length === 8) {
    return `+965${d}`;
  }
  return d.startsWith('+') ? d : `+${d}`;
}
