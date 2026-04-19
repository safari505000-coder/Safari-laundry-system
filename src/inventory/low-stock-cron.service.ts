import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { KUWAIT_TIMEZONE } from '../common/time/kuwait-time';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';

/**
 * Daily low-stock alert (Dastur §4 inventory supervision).
 *
 * Runs at Kuwait 06:00 so ops teams see the alert with morning coffee,
 * well after the midnight shift-cycle and serial-gap jobs. The snapshot
 * is stored in `AuditLog` as a JSON payload; the owner widget reads the
 * latest row via `latestSnapshot()` to avoid recomputing on every page
 * hit. A run with zero rows is still persisted so the UI can render
 * "last checked 06:00 — all healthy".
 */
const AUDIT_RESOURCE = '/inventory/low-stock';
const AUDIT_ACTION_ALERT = 'INVENTORY_LOW_STOCK_DETECTED';
const AUDIT_ACTION_CLEAN = 'INVENTORY_LOW_STOCK_CLEAN';

@Injectable()
export class LowStockCronService {
  private readonly logger = new Logger(LowStockCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  @Cron('0 6 * * *', { timeZone: KUWAIT_TIMEZONE })
  async handleCron(): Promise<void> {
    try {
      const report = await this.inventory.lowStock();
      await this.prisma.auditLog.create({
        data: {
          action:
            report.summary.total > 0
              ? AUDIT_ACTION_ALERT
              : AUDIT_ACTION_CLEAN,
          resource: AUDIT_RESOURCE,
          changes: report as unknown as Prisma.InputJsonValue,
        },
      });
      if (report.summary.total > 0) {
        this.logger.warn(
          `[LOW-STOCK] ${report.summary.outOfStock} out-of-stock, ${report.summary.lowStock} low-stock SKU-branches.`,
        );
      }
    } catch (err) {
      this.logger.error(`[LOW-STOCK] daily scan failed: ${String(err)}`);
    }
  }

  async latestSnapshot(): Promise<{
    hadAlerts: boolean;
    recordedAtIso: string;
    report: Awaited<ReturnType<InventoryService['lowStock']>>;
  } | null> {
    const row = await this.prisma.auditLog.findFirst({
      where: {
        resource: AUDIT_RESOURCE,
        action: { in: [AUDIT_ACTION_ALERT, AUDIT_ACTION_CLEAN] },
      },
      orderBy: { createdAt: 'desc' },
      select: { action: true, changes: true, createdAt: true },
    });
    if (!row) return null;
    const payload = row.changes as unknown;
    if (!payload || typeof payload !== 'object') return null;
    return {
      hadAlerts: row.action === AUDIT_ACTION_ALERT,
      recordedAtIso: row.createdAt.toISOString(),
      report: payload as Awaited<ReturnType<InventoryService['lowStock']>>,
    };
  }
}
