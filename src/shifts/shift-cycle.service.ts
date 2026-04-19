import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SafariRole, ShiftStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  KUWAIT_TIMEZONE,
  kuwaitMidnightUtc,
  nextKuwaitMidnightUtc,
} from '../common/time/kuwait-time';

/**
 * DUSTUR §2 — The financial cycle is an OWNER-owned concept that runs
 * automatically from 00:00 to 00:00 Kuwait time. Drivers and managers do
 * not open or close shifts manually.
 *
 * This service owns:
 *   • the nightly cron that closes the prior cycle's OPEN shifts and opens a
 *     fresh OPEN shift for every active driver,
 *   • the manual OWNER-only override endpoint (run-now),
 *   • snapshots for the Owner control panel (current cycle, recent cycles).
 */
@Injectable()
export class ShiftCycleService {
  private readonly logger = new Logger(ShiftCycleService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Nightly cron — 00:00 Kuwait time.
   *
   * Idempotent: if the job already ran (or a manual run-now happened minutes
   * earlier), the `startedAt: { lt: boundary }` filter keeps us from closing
   * freshly-opened shifts, and the createMany-with-duplicate-filter keeps us
   * from opening duplicates.
   */
  @Cron('0 0 * * *', { name: 'shift-cycle-daily', timeZone: KUWAIT_TIMEZONE })
  async handleCron(): Promise<void> {
    try {
      const result = await this.runDailyCycle();
      this.logger.log(
        `[shift-cycle] cron tick closed=${result.closed} opened=${result.opened} boundary=${result.cycleStartAt}`,
      );
    } catch (err) {
      this.logger.error('[shift-cycle] cron tick failed', err as Error);
    }
  }

  /**
   * Closes every stale OPEN shift (started before today's Kuwait midnight)
   * and opens a fresh OPEN shift for every active driver that doesn't already
   * have one in the current cycle.
   */
  async runDailyCycle(): Promise<{
    closed: number;
    opened: number;
    cycleStartAt: string;
  }> {
    const now = new Date();
    const boundary = kuwaitMidnightUtc(now);

    return this.prisma.$transaction(async (tx) => {
      const stale = await tx.shift.updateMany({
        where: { status: ShiftStatus.OPEN, startedAt: { lt: boundary } },
        data: {
          status: ShiftStatus.CLOSED,
          endedAt: new Date(boundary.getTime() - 1),
        },
      });

      const activeDrivers = await tx.user.findMany({
        where: { safariRole: SafariRole.DRIVER, isActive: true },
        select: { id: true },
      });
      if (activeDrivers.length === 0) {
        return {
          closed: stale.count,
          opened: 0,
          cycleStartAt: boundary.toISOString(),
        };
      }

      const driverIds = activeDrivers.map((d) => d.id);
      const existingOpen = await tx.shift.findMany({
        where: {
          status: ShiftStatus.OPEN,
          driverId: { in: driverIds },
          startedAt: { gte: boundary },
        },
        select: { driverId: true },
      });
      const openDriverSet = new Set(existingOpen.map((s) => s.driverId));
      const toOpen = driverIds.filter((id) => !openDriverSet.has(id));

      if (toOpen.length > 0) {
        await tx.shift.createMany({
          data: toOpen.map((driverId) => ({
            driverId,
            status: ShiftStatus.OPEN,
            startedAt: boundary,
          })),
        });
      }

      return {
        closed: stale.count,
        opened: toOpen.length,
        cycleStartAt: boundary.toISOString(),
      };
    });
  }

  /**
   * Snapshot of the current financial cycle for the Owner control panel.
   */
  async getCurrentCycle(): Promise<{
    timezone: string;
    cycleStartAt: string;
    cycleEndAt: string;
    nextCycleAt: string;
    driversOnShift: number;
    activeDriversTotal: number;
    staleOpenShifts: number;
  }> {
    const now = new Date();
    const start = kuwaitMidnightUtc(now);
    const next = nextKuwaitMidnightUtc(now);
    const end = new Date(next.getTime() - 1);

    const [driversOnShift, staleOpen, activeDriversTotal] = await Promise.all([
      this.prisma.shift.count({
        where: { status: ShiftStatus.OPEN, startedAt: { gte: start } },
      }),
      this.prisma.shift.count({
        where: { status: ShiftStatus.OPEN, startedAt: { lt: start } },
      }),
      this.prisma.user.count({
        where: { safariRole: SafariRole.DRIVER, isActive: true },
      }),
    ]);

    return {
      timezone: KUWAIT_TIMEZONE,
      cycleStartAt: start.toISOString(),
      cycleEndAt: end.toISOString(),
      nextCycleAt: next.toISOString(),
      driversOnShift,
      activeDriversTotal,
      staleOpenShifts: staleOpen,
    };
  }

  /**
   * Returns the last `days` cycles (default 7) with open/close counts.
   * Days are expressed in Kuwait-local midnight boundaries.
   */
  async getRecentCycles(days = 7): Promise<
    Array<{
      cycleStartAt: string;
      cycleEndAt: string;
      shiftsOpened: number;
      shiftsClosed: number;
    }>
  > {
    const capped = Math.max(1, Math.min(30, days));
    const now = new Date();
    const today = kuwaitMidnightUtc(now);
    const results = [] as Array<{
      cycleStartAt: string;
      cycleEndAt: string;
      shiftsOpened: number;
      shiftsClosed: number;
    }>;

    for (let i = 0; i < capped; i += 1) {
      const start = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const [opened, closed] = await Promise.all([
        this.prisma.shift.count({
          where: { startedAt: { gte: start, lt: end } },
        }),
        this.prisma.shift.count({
          where: { endedAt: { gte: start, lt: end } },
        }),
      ]);
      results.push({
        cycleStartAt: start.toISOString(),
        cycleEndAt: new Date(end.getTime() - 1).toISOString(),
        shiftsOpened: opened,
        shiftsClosed: closed,
      });
    }
    return results;
  }
}
