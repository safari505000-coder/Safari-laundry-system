import { Injectable } from '@nestjs/common';
import {
  CashStatus,
  OrderStatus,
  Prisma,
  SafariRole,
  ShiftStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { kuwaitMidnightUtc } from '../common/time/kuwait-time';

/**
 * V19.22.5 — Branch-scoped driver oversight cards.
 *
 * One aggregated row per active DRIVER in the manager's branch,
 * refreshed on demand by the Manager island "Driver Oversight"
 * page. Everything is per-driver so the page can colour each card
 * by status without any client-side aggregation.
 *
 * Stale quick-capture threshold matches the Accountant watchdog
 * (see `orders.service.ts`) — 24 h from createdAt for a
 * PENDING + UNPAID row that carries a `posPaymentMethod` (i.e. was
 * created through the quick-capture path, not full POS checkout).
 *
 * SSoT lock (post-mortem on the 111.450 KD vs 0.5000 KD mismatch):
 *
 *   This endpoint historically published two cash-shaped fields that
 *   competed with the cash-intelligence Single Source of Truth
 *   (`classified.drivers[].amount`):
 *
 *     • `cashTodayKd` — Σ Order.totalPrice for orders created today.
 *       This is **today's gross revenue attributed to the driver**,
 *       NOT the live cash residue the driver currently holds.
 *
 *     • `heldCashKd` — all-time Σ Order.totalPrice for orders with
 *       cashStatus = PAID_TO_DRIVER. This is a **legacy operational
 *       accumulator** with no time bound; it is NOT the live unsettled
 *       cash residue tracked by the cash-intelligence v2 engine.
 *
 *   Both fields are now permanently nullified on the wire (`null`) so
 *   no consumer can ever again interpret them as "driver cash". The
 *   ONLY sanctioned source for driver cash is
 *   `GET /api/cash-intelligence/dashboard` → `drivers[].totalCash`.
 *
 *   The underlying Prisma query that powered `heldCashKd` has been
 *   removed (no other field consumed it). The query that powered
 *   `cashTodayKd` is retained ONLY for `ordersTodayCount`; its `_sum`
 *   selector is dropped.
 */
const STALE_QUICK_HOURS = 24;

export type DriverOversightShiftStatus = 'ON_SHIFT' | 'OFF';

export type DriverOversightCard = {
  driverId: string;
  fullName: string;
  username: string;
  phone: string | null;
  branch: { id: string; name: string } | null;
  shiftStatus: DriverOversightShiftStatus;
  /** ISO timestamp of the currently-open shift's start, if any. */
  shiftStartedAt: string | null;
  ordersTodayCount: number;
  /**
   * @deprecated SSoT-locked. Always `null`. Driver cash is exposed
   *   only by `GET /api/cash-intelligence/dashboard`.
   */
  cashTodayKd: null;
  pendingInvoicesCount: number;
  /**
   * @deprecated SSoT-locked. Always `null`. Driver cash is exposed
   *   only by `GET /api/cash-intelligence/dashboard`.
   */
  heldCashKd: null;
  staleQuickCount: number;
  /**
   * Stale-quick capture amount (NOT a cash-residue field — it is the
   * Σ totalPrice of PENDING + UNPAID quick-capture orders older than
   * 24 h). Kept because it powers the operational risk badge, not the
   * "driver cash" tile.
   */
  staleQuickKd: string;
  /** Derived convenience flag so the FE badge doesn't re-implement it. */
  atRisk: boolean;
};

@Injectable()
export class DriverOversightService {
  constructor(private readonly prisma: PrismaService) {}

  async listForBranchManager(
    branchId: string | null,
  ): Promise<DriverOversightCard[]> {
    if (!branchId) return [];

    const drivers = await this.prisma.user.findMany({
      where: {
        role: { name: SafariRole.DRIVER },
        branchId,
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        phone: true,
        branch: { select: { id: true, name: true } },
      },
      orderBy: { fullName: 'asc' },
    });
    if (drivers.length === 0) return [];

    return this.buildCards(drivers);
  }

  /**
   * V19.22.5 — Admin-wide oversight (OWNER / GM).
   * Surfaced behind the same API shape so the UI can lift-and-shift
   * without a branch filter when the caller is allowed to see every
   * driver across the company.
   */
  async listForAllBranches(): Promise<DriverOversightCard[]> {
    const drivers = await this.prisma.user.findMany({
      where: {
        role: { name: SafariRole.DRIVER },
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        phone: true,
        branch: { select: { id: true, name: true } },
      },
      orderBy: { fullName: 'asc' },
    });
    return this.buildCards(drivers);
  }

  private async buildCards(
    drivers: {
      id: string;
      fullName: string;
      username: string;
      phone: string | null;
      branch: { id: string; name: string } | null;
    }[],
  ): Promise<DriverOversightCard[]> {
    const driverIds = drivers.map((d) => d.id);
    const todayStart = kuwaitMidnightUtc(new Date());
    const staleCutoff = new Date(
      Date.now() - STALE_QUICK_HOURS * 60 * 60 * 1000,
    );

    // SSoT lock: the `heldCashKd` Prisma query (PAID_TO_DRIVER
    // accumulator) is intentionally REMOVED. The only Order aggregates
    // we still need are operational counters: today's order count
    // (NOT today's revenue), pending UNPAID count, and stale-quick
    // capture totals — none of which are exposed as a driver-cash
    // tile on the dashboard.
    const [openShifts, todayOrders, pendingOrders, staleRows] =
      await Promise.all([
        this.prisma.shift.findMany({
          where: {
            driverId: { in: driverIds },
            status: ShiftStatus.OPEN,
          },
          select: { driverId: true, startedAt: true },
          orderBy: { startedAt: 'desc' },
        }),
        this.prisma.order.groupBy({
          by: ['driverId'],
          where: {
            driverId: { in: driverIds },
            createdAt: { gte: todayStart },
            status: { not: OrderStatus.CANCELED },
          },
          // NOTE: `_sum.totalPrice` was the source of `cashTodayKd`,
          // which conflicted with the cash-intelligence SSoT and is
          // permanently nullified on the wire. Only the count is read.
          _count: { _all: true },
        }),
        this.prisma.order.groupBy({
          by: ['driverId'],
          where: {
            driverId: { in: driverIds },
            cashStatus: CashStatus.UNPAID,
            status: { not: OrderStatus.CANCELED },
          },
          _count: { _all: true },
        }),
        this.prisma.order.groupBy({
          by: ['driverId'],
          where: {
            driverId: { in: driverIds },
            status: OrderStatus.PENDING,
            cashStatus: CashStatus.UNPAID,
            createdAt: { lt: staleCutoff },
          },
          _count: { _all: true },
          _sum: { totalPrice: true },
        }),
      ]);

    const firstShiftByDriver = new Map<string, Date>();
    for (const s of openShifts) {
      if (!firstShiftByDriver.has(s.driverId)) {
        firstShiftByDriver.set(s.driverId, s.startedAt);
      }
    }
    const byDriver = <T extends { driverId: string | null }>(
      rows: T[],
    ): Map<string, T> => {
      const m = new Map<string, T>();
      for (const r of rows) {
        if (r.driverId) m.set(r.driverId, r);
      }
      return m;
    };

    const todayMap = byDriver(todayOrders);
    const pendingMap = byDriver(pendingOrders);
    const staleMap = byDriver(staleRows);

    return drivers.map((d) => {
      const shiftStart = firstShiftByDriver.get(d.id) ?? null;
      const today = todayMap.get(d.id);
      const pending = pendingMap.get(d.id);
      const stale = staleMap.get(d.id);

      const staleKd = stale?._sum?.totalPrice ?? new Prisma.Decimal(0);
      const pendingCount =
        typeof pending?._count === 'object' ? (pending._count._all ?? 0) : 0;
      const staleCount =
        typeof stale?._count === 'object' ? (stale._count._all ?? 0) : 0;

      const atRisk = staleCount > 0 || pendingCount > 10;

      return {
        driverId: d.id,
        fullName: d.fullName,
        username: d.username,
        phone: d.phone,
        branch: d.branch,
        shiftStatus: shiftStart ? 'ON_SHIFT' : 'OFF',
        shiftStartedAt: shiftStart ? shiftStart.toISOString() : null,
        ordersTodayCount: today?._count._all ?? 0,
        // SSoT-locked. See module header — driver cash is published
        // ONLY by GET /api/cash-intelligence/dashboard.
        cashTodayKd: null,
        pendingInvoicesCount: pendingCount,
        // SSoT-locked. See module header — driver cash is published
        // ONLY by GET /api/cash-intelligence/dashboard.
        heldCashKd: null,
        staleQuickCount: staleCount,
        staleQuickKd: staleKd.toFixed(3),
        atRisk,
      };
    });
  }
}
