import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { KUWAIT_TIMEZONE } from '../common/time/kuwait-time';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';

/**
 * V19.22.4 — Daily audit of dangling Quick-Capture invoices.
 *
 * Complementary to the live read endpoint
 * `GET /orders/stale-quick-risks`: the endpoint powers the live
 * Accountant dashboard banner, while this cron writes a permanent
 * `AuditLog` row every morning so there is a historical trail the
 * Owner can review at end-of-month ("which drivers repeatedly leave
 * invoices dangling? how many KWD are at risk on average?").
 *
 * Running cost is negligible — a single indexed `findMany` on a
 * small predicate set (`PENDING` + `UNPAID` + `createdAt < cutoff`).
 * The cron **never mutates** orders; it's purely observational so
 * operational data integrity is guaranteed.
 *
 * Scheduled at **08:00 Kuwait** so the Accountant finds the report
 * waiting when they open their dashboard at the start of the day.
 */
const AUDIT_RESOURCE = '/orders/stale-quick-orders';
const AUDIT_ACTION_CLEAN = 'STALE_QUICK_ORDERS_CLEAN';
const AUDIT_ACTION_FLAG = 'STALE_QUICK_ORDERS_FLAGGED';

@Injectable()
export class StaleQuickOrdersCronService {
  private readonly logger = new Logger(StaleQuickOrdersCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  @Cron('0 8 * * *', {
    name: 'stale-quick-orders-daily-audit',
    timeZone: KUWAIT_TIMEZONE,
  })
  async handleCron(): Promise<void> {
    try {
      const risks = await this.orders.listStaleQuickOrderRisks();
      const count = risks.length;
      const totalKd = risks.reduce(
        (sum, r) => sum + Number.parseFloat(r.amountKd),
        0,
      );

      const action = count === 0 ? AUDIT_ACTION_CLEAN : AUDIT_ACTION_FLAG;
      const payload = {
        scannedAt: new Date().toISOString(),
        count,
        totalKd: totalKd.toFixed(3),
        items: risks.map((r) => ({
          orderId: r.orderId,
          readableId: r.readableId,
          driverName: r.driverName,
          customerName: r.customerName,
          amountKd: r.amountKd,
          ageHours: r.ageHours,
          paymentMethod: r.paymentMethod,
        })),
      };

      await this.prisma.auditLog.create({
        data: {
          action,
          resource: AUDIT_RESOURCE,
          changes: payload as unknown as Prisma.InputJsonValue,
        },
      });

      if (count === 0) {
        this.logger.log(
          'Stale Quick-Order audit: no dangling invoices > 24h.',
        );
      } else {
        this.logger.warn(
          `Stale Quick-Order audit: ${count} dangling invoice(s) totalling ${totalKd.toFixed(3)} KWD.`,
        );
      }
    } catch (err) {
      this.logger.error(
        'Stale Quick-Order audit failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
