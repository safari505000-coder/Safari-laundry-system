import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import {
  computeOrderRemainingBalancesBatch,
  INVOICE_REMAINING_TOLERANCE_KD,
} from '../finance/debt-customer-aggregates.util';
import {
  CreatePaymentLinkResult,
  PaymentsService,
} from '../common/services/payments.service';
import { resolveCustomerPhoneForNotify } from '../common/validation/kuwait-customer-phone';
import { InvoicePaymentStatusService } from '../finance/invoice-payment-status.service';
import { DebtVisibilityService } from '../finance/debt-visibility/debt-visibility.service';
import { PrismaService } from '../prisma/prisma.service';
import { pickPrimaryPayableOrderId } from './customer-portal-payable.util';

function normalizePhone(value: string): string {
  return value.replace(/[\s-]/g, '').trim();
}

function customerOwnsPhone(
  customer: { phone: string; phone2: string | null },
  queryPhone: string,
): boolean {
  const norm = normalizePhone(queryPhone);
  return (
    normalizePhone(customer.phone) === norm ||
    (customer.phone2 != null && normalizePhone(customer.phone2) === norm)
  );
}

type PublicWebMeta = {
  requestedAt?: string;
  phone?: string;
};

@Injectable()
export class WebsiteCustomerPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly invoicePaymentStatus: InvoicePaymentStatusService,
    private readonly debtVisibility: DebtVisibilityService,
  ) {}

  async createPaymentLinkForCustomerBalance(customerPhone: string) {
    const phone = normalizePhone(customerPhone);
    const customer = await this.prisma.customer.findFirst({
      where: { OR: [{ phone }, { phone2: phone }] },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer was not found.');
    }

    const visible = await this.debtVisibility.getCustomerVisibleDebt(
      customer.id,
    );
    const tolerance = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);
    const visibleDebt = new Prisma.Decimal(visible.remainingDebtKd);
    if (visibleDebt.lessThanOrEqualTo(tolerance)) {
      throw new BadRequestException('No outstanding balance on this account.');
    }

    let orderId = await pickPrimaryPayableOrderId(
      this.prisma,
      this.invoicePaymentStatus,
      customer.id,
    );
    const amountKd = visibleDebt.toFixed(4);

    if (!orderId) {
      const anchor = await this.prisma.order.findFirst({
        where: {
          customerId: customer.id,
          status: { not: OrderStatus.CANCELED },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (!anchor) {
        throw new BadRequestException(
          'No invoice was found to attach this payment. Please call 22200299.',
        );
      }
      orderId = anchor.id;
    }

    return this.createPaymentLinkFromWebsite(phone, orderId, amountKd);
  }

  async createPaymentLinkFromWebsite(
    customerPhone: string,
    orderId: string,
    amountKd?: string,
  ) {
    const phone = normalizePhone(customerPhone);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        customer: {
          select: { id: true, phone: true, phone2: true },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('Order was not found.');
    }
    if (order.status === OrderStatus.CANCELED) {
      throw new BadRequestException('Order is canceled.');
    }
    if (!customerOwnsPhone(order.customer, phone)) {
      throw new ForbiddenException(
        'This invoice does not belong to the phone number provided.',
      );
    }

    const payment = await this.invoicePaymentStatus.derivePaymentStatus(orderId);
    const remainingByOrder = await computeOrderRemainingBalancesBatch(
      this.prisma,
      [orderId],
    );
    const batchRemaining =
      remainingByOrder.get(orderId) ??
      new Prisma.Decimal(payment.remainingAmountKd);
    const chargeKd = amountKd
      ? new Prisma.Decimal(amountKd)
      : batchRemaining;
    if (chargeKd.lessThanOrEqualTo(new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD))) {
      throw new BadRequestException('Order is already paid.');
    }

    const link = await this.ensureCollectiblePaymentLink(
      orderId,
      chargeKd.toFixed(4),
    );

    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { posGatewayMetadata: true },
    });
    const meta =
      row?.posGatewayMetadata &&
      typeof row.posGatewayMetadata === 'object' &&
      !Array.isArray(row.posGatewayMetadata)
        ? (row.posGatewayMetadata as Record<string, unknown>)
        : {};
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        posGatewayMetadata: {
          ...meta,
          publicWeb: {
            requestedAt: new Date().toISOString(),
            phone,
          } satisfies PublicWebMeta,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      orderId,
      paymentUrl: link.url,
      status: 'READY' as const,
      remainingAmountKd: chargeKd.toFixed(4),
      message:
        'تم إنشاء رابط الدفع. سيتم تحويلك إلى بوابة UPayments لإتمام العملية.',
    };
  }

  async listForCallCenter(filter: 'PENDING' | 'PAID' | 'ALL' = 'PENDING') {
    const orders = await this.prisma.order.findMany({
      where: {
        posGatewayMetadata: {
          path: ['publicWeb', 'requestedAt'],
          not: Prisma.DbNull,
        },
        status: { not: OrderStatus.CANCELED },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        invoiceNumber: true,
        serialNumber: true,
        cashStatus: true,
        status: true,
        posHostedPaymentUrl: true,
        posGatewayMetadata: true,
        createdAt: true,
        completedAt: true,
        customer: {
          select: {
            id: true,
            phone: true,
            displayName: true,
          },
        },
      },
    });

    const rows = await Promise.all(
      orders.map(async (order) => {
        const payment = await this.invoicePaymentStatus.derivePaymentStatus(
          order.id,
        );
        const meta =
          order.posGatewayMetadata &&
          typeof order.posGatewayMetadata === 'object' &&
          !Array.isArray(order.posGatewayMetadata)
            ? (order.posGatewayMetadata as { publicWeb?: PublicWebMeta })
            : null;
        return {
          orderId: order.id,
          invoiceNumber: order.invoiceNumber,
          serialNumber: order.serialNumber,
          customerId: order.customer.id,
          customerPhone: order.customer.phone,
          customerDisplayName: order.customer.displayName,
          totalAmountKd: payment.totalAmountKd,
          remainingAmountKd: payment.remainingAmountKd,
          paymentStatus: payment.status,
          cashStatus: order.cashStatus,
          orderStatus: order.status,
          paymentUrl: order.posHostedPaymentUrl,
          requestedAtIso: meta?.publicWeb?.requestedAt ?? null,
          requestedPhone: meta?.publicWeb?.phone ?? null,
          createdAtIso: order.createdAt.toISOString(),
          completedAtIso: order.completedAt?.toISOString() ?? null,
        };
      }),
    );

    const payments = rows.filter((row) => {
      const open = Number(row.remainingAmountKd) > 0.001;
      if (filter === 'ALL') return true;
      if (filter === 'PENDING') return open;
      return !open;
    });

    return { payments };
  }

  /**
   * Hosted checkout for canonical remaining AR — supports both classic
   * UNPAID payment-link invoices and completed DEBT_ON_ACCOUNT rows.
   */
  private async ensureCollectiblePaymentLink(
    orderId: string,
    remainingAmountKd: string,
  ): Promise<CreatePaymentLinkResult> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        cashStatus: true,
        walletSettledAt: true,
        posHostedPaymentUrl: true,
        posGatewayTrackId: true,
        posGatewayMetadata: true,
        customer: {
          select: {
            id: true,
            phone: true,
            phone2: true,
            displayName: true,
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('Order was not found.');
    }

    const remaining = new Prisma.Decimal(remainingAmountKd);
    if (remaining.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Order is already paid.');
    }

    const tolerance = new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD);
    const storedChargeKd = this.readStoredPaymentLinkChargeKd(
      order.posGatewayMetadata,
    );
    if (
      order.posHostedPaymentUrl &&
      order.posGatewayTrackId &&
      storedChargeKd &&
      this.paymentLinkChargeMatches(storedChargeKd, remaining, tolerance)
    ) {
      return {
        url: order.posHostedPaymentUrl,
        trackId: order.posGatewayTrackId,
      };
    }

    const link = await this.payments.createPaymentLink({
      orderId: order.id,
      amount: remaining,
      customerPhone: resolveCustomerPhoneForNotify(
        order.customer.phone,
        order.customer.phone2,
      ),
      customerName: order.customer.displayName ?? undefined,
      customerUniqueId: order.customer.id.slice(0, 20),
    });

    const existingMeta =
      order.posGatewayMetadata &&
      typeof order.posGatewayMetadata === 'object' &&
      !Array.isArray(order.posGatewayMetadata)
        ? (order.posGatewayMetadata as Record<string, unknown>)
        : {};

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        posHostedPaymentUrl: link.url,
        posGatewayTrackId: link.trackId ?? null,
        posGatewayMetadata: {
          ...existingMeta,
          charge: {
            provider: 'upayments',
            trackId: link.trackId ?? null,
            link: link.url,
            amountKd: remaining.toFixed(4),
            createdAt: new Date().toISOString(),
          },
        } as Prisma.InputJsonValue,
      },
    });

    return link;
  }

  /** CC full-balance WhatsApp — marks the anchor order so Collections shows the live link. */
  async recordFullBalanceLinkSent(
    orderId: string,
    amountKd: string,
    sentByUserId: string,
  ): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { posGatewayMetadata: true },
    });
    if (!order) return;
    const existingMeta =
      order.posGatewayMetadata &&
      typeof order.posGatewayMetadata === 'object' &&
      !Array.isArray(order.posGatewayMetadata)
        ? (order.posGatewayMetadata as Record<string, unknown>)
        : {};
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        ccCollectionPaymentWaLocked: true,
        lastReminderAt: new Date(),
        posGatewayMetadata: {
          ...existingMeta,
          fullBalance: {
            amountKd,
            sentAt: new Date().toISOString(),
            sentByUserId,
          },
        } as Prisma.InputJsonValue,
      },
    });
  }

  private readStoredPaymentLinkChargeKd(
    metadata: Prisma.JsonValue | null,
  ): Prisma.Decimal | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }
    const charge = (metadata as Record<string, unknown>).charge;
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

  private paymentLinkChargeMatches(
    stored: Prisma.Decimal,
    current: Prisma.Decimal,
    tolerance: Prisma.Decimal,
  ): boolean {
    return stored.sub(current).abs().lessThanOrEqualTo(tolerance);
  }
}
