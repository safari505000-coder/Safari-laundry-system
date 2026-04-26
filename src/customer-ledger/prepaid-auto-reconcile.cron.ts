import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CashStatus, OrderStatus, Prisma } from '@prisma/client';
import { KUWAIT_TIMEZONE } from '../common/time/kuwait-time';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerLedgerService } from './customer-ledger.service';

/**
 * V19.13.1 — Background prepaid reconciliation.
 *
 * `autoReconcileUnpaidInvoicesFromPrepaidBalanceTx` already runs at the end
 * of subscription activation, but operators who activated *before* that deploy
 * (or any edge path that skipped the hook) would keep UNPAID invoices while
 * `CustomerWallet.balance` stayed positive. This cron closes that gap by
 * re-running the same FIFO logic on a schedule — no UI action required.
 *
 * Disable with `PREPAID_AUTO_RECONCILE_CRON_DISABLED=true` if ever needed.
 */
@Injectable()
export class PrepaidAutoReconcileCronService {
  private readonly logger = new Logger(PrepaidAutoReconcileCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: CustomerLedgerService,
  ) {}

  @Cron('*/15 * * * *', {
    name: 'prepaid-auto-reconcile',
    timeZone: KUWAIT_TIMEZONE,
  })
  async handleCron(): Promise<void> {
    if (process.env.PREPAID_AUTO_RECONCILE_CRON_DISABLED === 'true') {
      return;
    }
    try {
      const candidates = await this.prisma.order.findMany({
        where: {
          cashStatus: CashStatus.UNPAID,
          status: { not: OrderStatus.CANCELED },
          walletSettledAt: null,
          posPaymentBundleId: null,
          customer: {
            wallet: {
              balance: { gt: new Prisma.Decimal(0) },
            },
          },
        },
        distinct: ['customerId'],
        orderBy: { customerId: 'asc' },
        select: { customerId: true },
        take: 250,
      });

      if (candidates.length === 0) {
        return;
      }

      let invoicesSettled = 0;
      let customersTouched = 0;

      for (const { customerId } of candidates) {
        const { paidOrderIds } =
          await this.ledger.runPrepaidAutoReconcileForCustomer(
            customerId,
            null,
          );
        if (paidOrderIds.length > 0) {
          customersTouched += 1;
          invoicesSettled += paidOrderIds.length;
        }
      }

      if (invoicesSettled > 0) {
        this.logger.log(
          `[prepaid-auto-reconcile cron] settled ${invoicesSettled} invoice(s) for ${customersTouched} customer(s) (batch scanned=${candidates.length})`,
        );
      }
    } catch (e) {
      this.logger.error('[prepaid-auto-reconcile cron] failed', e as Error);
    }
  }
}
