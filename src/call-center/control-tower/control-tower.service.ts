import { Injectable } from '@nestjs/common';
import {
  CashStatus,
  CustomerCollectionStatusKind,
  DispatchStatus,
  OrderStatus,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ControlTowerPreset,
  ControlTowerQueryDto,
} from './dto/control-tower-query.dto';
import type {
  ControlTowerDriverWorkloadDto,
  ControlTowerResponseDto,
  ControlTowerRiskLevelDto,
  ControlTowerRowDto,
  ControlTowerSlaStatusDto,
} from './dto/control-tower-response.dto';

/** Kuwait fixed offset (+03:00). Matches CallCenter operations-summary semantics. */
const KUWAIT_OFFSET_MS = 3 * 60 * 60 * 1000;
const MS_PER_DAY = 86_400_000;

function kuwaitDayBounds(now: Date): { dayStart: Date; dayEnd: Date } {
  const shifted = new Date(now.getTime() + KUWAIT_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  const dayStart = new Date(Date.UTC(y, m, d) - KUWAIT_OFFSET_MS);
  const dayEnd = new Date(dayStart.getTime() + MS_PER_DAY);
  return { dayStart, dayEnd };
}

function kuwaitMonthStart(now: Date): Date {
  const shifted = new Date(now.getTime() + KUWAIT_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  return new Date(Date.UTC(y, m, 1) - KUWAIT_OFFSET_MS);
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Read-model SLA for an **open** dispatch (`ASSIGNED` / `IN_PROGRESS`).
 * Combines persisted breach/escalation stamps with wall-clock minutes since creation.
 */
function computeDispatchSla(d: {
  createdAt: Date;
  breachedAt: Date | null;
  escalatedAt: Date | null;
}): ControlTowerSlaStatusDto {
  const mins = (Date.now() - d.createdAt.getTime()) / 60_000;
  if (d.breachedAt != null || mins >= 10) return 'BREACHED';
  if (d.escalatedAt != null || mins >= 5) return 'ESCALATED';
  if (mins >= 2) return 'LATE';
  return 'OK';
}

function slaRank(s: ControlTowerSlaStatusDto): number {
  switch (s) {
    case 'BREACHED':
      return 4;
    case 'ESCALATED':
      return 3;
    case 'LATE':
      return 2;
    default:
      return 1;
  }
}

function riskRank(r: ControlTowerRiskLevelDto): number {
  switch (r) {
    case 'RISK':
      return 3;
    case 'LATE':
      return 2;
    default:
      return 1;
  }
}

type AggOrder = {
  customerId: string;
  driverId: string | null;
  totalPrice: Prisma.Decimal;
  createdAt: Date;
  dueDate: Date | null;
};

type DispatchPick = {
  id: string;
  customerId: string;
  driverId: string;
  status: DispatchStatus;
  createdAt: Date;
  breachedAt: Date | null;
  escalatedAt: Date | null;
};

/**
 * Call Center Control Tower — unified AR + active dispatch read-model.
 *
 * Financial predicate: `cashStatus = UNPAID` AND `status ≠ CANCELED`.
 * No ledger mutation, no automatic blocking, no driver reassignment from here.
 */
@Injectable()
export class ControlTowerService {
  constructor(private readonly prisma: PrismaService) {}

  async getSnapshot(query: ControlTowerQueryDto): Promise<ControlTowerResponseDto> {
    const preset = query.preset ?? ControlTowerPreset.ALL;
    const topLimit = Math.min(Math.max(query.topLimit ?? 50, 1), 200);
    const driverFilter = query.driverId?.trim();

    const { filter: createdAtFilter, windowFromIso, windowToIso } =
      this.resolveCreatedAtWindow(preset);

    const orders = (await this.prisma.order.findMany({
      where: {
        cashStatus: CashStatus.UNPAID,
        status: { not: OrderStatus.CANCELED },
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      },
      select: {
        customerId: true,
        driverId: true,
        totalPrice: true,
        createdAt: true,
        dueDate: true,
      },
    })) as AggOrder[];

    const nowMs = Date.now();

    const byCustomer = new Map<string, AggOrder[]>();
    for (const o of orders) {
      const list = byCustomer.get(o.customerId) ?? [];
      list.push(o);
      byCustomer.set(o.customerId, list);
    }

    const nowDate = new Date(nowMs);
    const { dayStart, dayEnd } = kuwaitDayBounds(nowDate);
    /** Keep in sync with `DispatchService` CC dashboard rolling visibility window (4h). */
    const CC_DASHBOARD_MAX_ASSIGNMENT_AGE_MS = 4 * 60 * 60 * 1000;
    const recentCutoff = new Date(nowMs - CC_DASHBOARD_MAX_ASSIGNMENT_AGE_MS);
    const dispatchCreatedFrom =
      recentCutoff.getTime() > dayStart.getTime() ? recentCutoff : dayStart;

    const ccDashboardDispatchWhere = {
      status: DispatchStatus.ASSIGNED,
      createdAt: {
        gte: dispatchCreatedFrom,
        lt: dayEnd,
      },
      createdBy: {
        is: {
          safariRole: {
            in: [SafariRole.CALL_CENTER, SafariRole.CALL_CENTER_SUPERVISOR],
          },
        },
      },
    };

    const [activeDispatchesAll, collectionStatuses, customerRows] =
      await Promise.all([
        this.prisma.dispatch.findMany({
          where: ccDashboardDispatchWhere,
          select: {
            id: true,
            customerId: true,
            driverId: true,
            status: true,
            createdAt: true,
            breachedAt: true,
            escalatedAt: true,
          },
        }),
        byCustomer.size === 0
          ? Promise.resolve(
              [] as {
                customerId: string;
                status: CustomerCollectionStatusKind;
                blocked: boolean;
              }[],
            )
          : this.prisma.customerCollectionStatus.findMany({
              where: { customerId: { in: [...byCustomer.keys()] } },
              select: {
                customerId: true,
                status: true,
                blocked: true,
              },
            }),
        byCustomer.size === 0
          ? Promise.resolve(
              [] as {
                id: string;
                displayName: string | null;
                phone: string;
              }[],
            )
          : this.prisma.customer.findMany({
              where: { id: { in: [...byCustomer.keys()] } },
              select: { id: true, displayName: true, phone: true },
            }),
      ]);

    const activeDispatches = activeDispatchesAll as DispatchPick[];

    const slaBreached = activeDispatches.filter(
      (d) => computeDispatchSla(d) === 'BREACHED',
    ).length;

    const collectionByCustomer = new Map(
      collectionStatuses.map((c) => [c.customerId, c]),
    );
    const customerById = new Map(customerRows.map((c) => [c.id, c]));

    const dispatchesByCustomer = new Map<string, DispatchPick[]>();
    for (const d of activeDispatches) {
      const list = dispatchesByCustomer.get(d.customerId) ?? [];
      list.push(d);
      dispatchesByCustomer.set(d.customerId, list);
    }

    const workloadDriverIds = [
      ...new Set(activeDispatches.map((d) => d.driverId)),
    ];
    const workloadUsers =
      workloadDriverIds.length === 0
        ? []
        : await this.prisma.user.findMany({
            where: { id: { in: workloadDriverIds } },
            select: { id: true, fullName: true },
          });
    const driverNameForWorkload = new Map(
      workloadUsers.map((u) => [u.id, u.fullName]),
    );

    const driversOut: ControlTowerDriverWorkloadDto[] = [];
    for (const driverId of workloadDriverIds) {
      const driverDispatches = activeDispatches.filter(
        (d) => d.driverId === driverId,
      );
      driversOut.push({
        driverId,
        name: driverNameForWorkload.get(driverId) ?? '—',
        assigned: driverDispatches.filter(
          (d) => d.status === DispatchStatus.ASSIGNED,
        ).length,
        inProgress: driverDispatches.filter(
          (d) => d.status === DispatchStatus.IN_PROGRESS,
        ).length,
        late: driverDispatches.filter((d) => computeDispatchSla(d) !== 'OK')
          .length,
      });
    }
    driversOut.sort((a, b) => {
      const loadDiff =
        b.assigned +
        b.inProgress -
        (a.assigned + a.inProgress);
      if (loadDiff !== 0) return loadDiff;
      return b.late - a.late;
    });

    if (byCustomer.size === 0) {
      return {
        kpis: {
          totalDue: 0,
          customersWithDebt: 0,
          lateCustomers: 0,
          riskCustomers: 0,
          activeDispatches: activeDispatches.length,
          slaBreached,
        },
        drivers: driversOut,
        rows: [],
        meta: {
          preset,
          generatedAt: new Date().toISOString(),
          windowFromIso,
          windowToIso,
        },
      };
    }

    const orderDriverIds = Array.from(
      new Set(
        orders
          .map((o) => o.driverId)
          .filter((id): id is string => typeof id === 'string'),
      ),
    );
    const dispatchDriverIds = [
      ...new Set(activeDispatches.map((d) => d.driverId)),
    ];
    const combinedDriverIds = [...new Set([...orderDriverIds, ...dispatchDriverIds])];

    const driverNameById =
      combinedDriverIds.length === 0
        ? new Map<string, string>()
        : new Map(
            (
              await this.prisma.user.findMany({
                where: { id: { in: combinedDriverIds } },
                select: { id: true, fullName: true },
              })
            ).map((u) => [u.id, u.fullName]),
          );

    type InternalRow = {
      row: Omit<
        ControlTowerRowDto,
        | 'customerName'
        | 'phone'
        | 'driverName'
      > & { customerId: string };
      sortRisk: ControlTowerRiskLevelDto;
      totalDue: number;
      daysLate: number;
      matchesDriverFilter: boolean;
    };

    const internals: InternalRow[] = [];

    for (const [customerId, custOrders] of byCustomer.entries()) {
      const totalDue = custOrders.reduce(
        (sum, o) => sum + Number(o.totalPrice ?? 0),
        0,
      );
      const invoicesCount = custOrders.length;

      const dueDates = custOrders
        .map((o) => o.dueDate)
        .filter((d): d is Date => d instanceof Date);
      const earliestDue =
        dueDates.length === 0 ?
          null
        : [...dueDates].sort((a, b) => a.getTime() - b.getTime())[0];

      const earliestCreatedMs = Math.min(
        ...custOrders.map((o) => o.createdAt.getTime()),
      );
      const anchorMs = earliestDue?.getTime() ?? earliestCreatedMs ?? nowMs;
      const daysLate = Math.max(
        0,
        Math.floor((nowMs - anchorMs) / MS_PER_DAY),
      );

      const sortedForDriver = [...custOrders].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
      const primaryDriverId = sortedForDriver[0]?.driverId ?? null;

      const coll = collectionByCustomer.get(customerId);
      const riskLevel = (coll?.status ?? 'NORMAL') as ControlTowerRiskLevelDto;
      const blocked = coll?.blocked ?? false;

      const custDispatches = dispatchesByCustomer.get(customerId) ?? [];
      let picked: DispatchPick | null = null;
      let bestSla: ControlTowerSlaStatusDto = 'OK';
      for (const d of custDispatches) {
        const sla = computeDispatchSla(d);
        if (
          !picked ||
          slaRank(sla) > slaRank(bestSla) ||
          (slaRank(sla) === slaRank(bestSla) &&
            d.createdAt.getTime() < picked.createdAt.getTime())
        ) {
          picked = d;
          bestSla = sla;
        }
      }

      const hasActiveDispatch = custDispatches.length > 0;
      const dispatchStatus =
        picked ?
          picked.status === DispatchStatus.ASSIGNED ?
            'ASSIGNED'
          : 'IN_PROGRESS'
        : null;

      const orderMatchesDriver =
        !!driverFilter &&
        custOrders.some((o) => o.driverId === driverFilter);
      const dispatchMatchesDriver =
        !!driverFilter &&
        custDispatches.some((d) => d.driverId === driverFilter);
      const matchesDriverFilter =
        !driverFilter ||
        orderMatchesDriver ||
        dispatchMatchesDriver ||
        primaryDriverId === driverFilter;

      internals.push({
        row: {
          customerId,
          totalDue: round4(totalDue),
          invoicesCount,
          daysLate,
          riskLevel,
          hasActiveDispatch,
          dispatchStatus,
          slaStatus: hasActiveDispatch ? bestSla : 'OK',
          blocked,
        },
        sortRisk: riskLevel,
        totalDue,
        daysLate,
        matchesDriverFilter,
      });
    }

    const filtered = internals.filter((r) => r.matchesDriverFilter);

    let lateCustomers = 0;
    let riskCustomers = 0;
    let portfolioDue = 0;

    for (const r of filtered) {
      portfolioDue += r.totalDue;
      const coll = collectionByCustomer.get(r.row.customerId);
      const collLate = coll?.status === 'LATE';
      const collRisk = coll?.status === 'RISK';
      if (collRisk) riskCustomers++;
      if (collLate || r.daysLate >= 3) lateCustomers++;
    }

    filtered.sort((a, b) => {
      const rr = riskRank(b.sortRisk) - riskRank(a.sortRisk);
      if (rr !== 0) return rr;
      if (b.totalDue !== a.totalDue) return b.totalDue - a.totalDue;
      return b.daysLate - a.daysLate;
    });

    const sliced = filtered.slice(0, topLimit);

    const rows: ControlTowerRowDto[] = sliced.map((r) => {
      const c = customerById.get(r.row.customerId);
      const displayName = (c?.displayName ?? c?.phone ?? r.row.customerId).trim();
      let driverName = '—';
      const custDispatches =
        dispatchesByCustomer.get(r.row.customerId) ?? [];
      let picked: DispatchPick | null = null;
      let bestSla: ControlTowerSlaStatusDto = 'OK';
      for (const d of custDispatches) {
        const sla = computeDispatchSla(d);
        if (
          !picked ||
          slaRank(sla) > slaRank(bestSla) ||
          (slaRank(sla) === slaRank(bestSla) &&
            d.createdAt.getTime() < picked.createdAt.getTime())
        ) {
          picked = d;
          bestSla = sla;
        }
      }
      const sortedForDriver = [...(byCustomer.get(r.row.customerId) ?? [])].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
      const primaryDriverId = sortedForDriver[0]?.driverId ?? null;
      if (picked) {
        driverName =
          driverNameById.get(picked.driverId) ?? '—';
      } else if (primaryDriverId) {
        driverName =
          driverNameById.get(primaryDriverId) ?? '—';
      }

      return {
        ...r.row,
        customerName: displayName,
        phone: c?.phone ?? '—',
        driverName,
        slaStatus:
          r.row.hasActiveDispatch ? bestSla : 'OK',
      };
    });

    return {
      kpis: {
        totalDue: round4(portfolioDue),
        customersWithDebt: filtered.length,
        lateCustomers,
        riskCustomers,
        activeDispatches: activeDispatches.length,
        slaBreached,
      },
      drivers: driversOut,
      rows,
      meta: {
        preset,
        generatedAt: new Date().toISOString(),
        windowFromIso,
        windowToIso,
      },
    };
  }

  private resolveCreatedAtWindow(preset: ControlTowerPreset): {
    filter?: Prisma.DateTimeFilter;
    windowFromIso: string | null;
    windowToIso: string | null;
  } {
    const now = new Date();

    if (preset === ControlTowerPreset.ALL) {
      return { filter: undefined, windowFromIso: null, windowToIso: null };
    }

    if (preset === ControlTowerPreset.TODAY) {
      const { dayStart } = kuwaitDayBounds(now);
      return {
        filter: { gte: dayStart, lte: now },
        windowFromIso: dayStart.toISOString(),
        windowToIso: now.toISOString(),
      };
    }

    if (preset === ControlTowerPreset.WEEK) {
      const from = new Date(now.getTime() - 7 * MS_PER_DAY);
      return {
        filter: { gte: from, lte: now },
        windowFromIso: from.toISOString(),
        windowToIso: now.toISOString(),
      };
    }

    const monthStart = kuwaitMonthStart(now);
    return {
      filter: { gte: monthStart, lte: now },
      windowFromIso: monthStart.toISOString(),
      windowToIso: now.toISOString(),
    };
  }
}
