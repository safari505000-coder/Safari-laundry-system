import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CashStatus,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
} from '@prisma/client';
import {
  CustomerLedgerService,
  type OrderWalletSettlementPrefetch,
} from '../../customer-ledger/customer-ledger.service';
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

  /**
   * Calls Kuwait Gateway (or compatible) API to create a hosted payment URL.
   * Contract is normalized; adjust paths/body to match your provider’s docs.
   */
  async createPaymentLink(
    params: CreatePaymentLinkParams,
  ): Promise<CreatePaymentLinkResult> {
    if (!this.apiBase || !this.apiKey || !this.merchantId) {
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
   * After gateway confirms payment: complete order + wallet settlement (same as instant POS).
   */
  async finalizePaidOrderFromGateway(orderId: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: {
            id: true,
            status: true,
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
          return;
        }
        if (order.status !== OrderStatus.PENDING) {
          throw new BadRequestException(
            'Order is not awaiting gateway payment',
          );
        }
        if (
          order.posPaymentMethod !== PosPaymentMethod.ONLINE &&
          order.posPaymentMethod !== PosPaymentMethod.PAYMENT_LINK
        ) {
          throw new BadRequestException(
            'Order is not a payment-link checkout',
          );
        }

        const completedAt = new Date();
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.COMPLETED,
            cashStatus: CashStatus.PAID_TO_DRIVER,
            completedAt,
          },
        });

        const performerId = order.driverId;
        if (!performerId) {
          throw new BadRequestException(
            'Order has no driver — cannot finalize settlement',
          );
        }

        const prefetch: OrderWalletSettlementPrefetch = {
          customerId: order.customerId,
          totalPrice: order.totalPrice,
          posPaymentMethod: order.posPaymentMethod,
          walletSettledAt: null,
          skipPerformerLookup: true,
        };

        await this.customerLedger.applyOrderWalletSettlementForCompletedOrder(
          tx,
          orderId,
          performerId,
          prefetch,
        );
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
