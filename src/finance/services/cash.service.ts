import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashStatus,
  ManagerCashCustodyStatus,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
  SafariRole,
  ShiftStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { ConfirmHandoverDto } from '../dto/confirm-handover.dto';
import type {
  DriverBalanceResponseDto,
  DriverBalanceRowDto,
  HandoverResultDto,
} from '../dto/driver-balance.dto';
import type {
  DriverCashTraceBagDto,
  DriverCashTraceDriverDto,
  DriverCashTraceQueryDto,
  DriverCashTraceResponseDto,
} from '../dto/driver-cash-trace.dto';
import type { UpdateDriverTrackingDto } from '../dto/update-driver-tracking.dto';
import { assertInstitutionalMutationAllowed } from '../../auth/institutional-mutation.util';
import {
  assertDeclaredMatchesLedgerMinor,
  minorToAmountString,
  sumOrderMinors,
} from '../finance-money';
import { computeCanonicalDriverCashCustodySummary } from '../canonical-financial-projection';
import type { CashReconciliationSnapshotDto } from '../dto/cash-reconciliation.dto';

function sumKd(values: string[]): string {
  let total = 0;
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) total += n;
  }
  return total.toFixed(4);
}

function zeroKpis() {
  return {
    totalCollectedKd: '0.0000',
    totalHandedToManagerKd: '0.0000',
    totalAtBankKd: '0.0000',
    totalPendingWithDriverKd: '0.0000',
    totalPendingAtManagerKd: '0.0000',
    totalAwaitingVerificationKd: '0.0000',
    totalRejectedKd: '0.0000',
    totalCollectedOrderCount: 0,
    totalBagCount: 0,
  };
}

function parseLatLng(input?: string | null): { lat: number; lng: number } | null {
  if (!input) return null;
  const parts = input.split(',').map((x) => Number.parseFloat(x.trim()));
  if (parts.length !== 2) return null;
  const [lat, lng] = parts;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  /**
   * DUSTUR §2 — the financial cycle is owned by {@link ShiftCycleService} and
   * runs automatically at 00:00 Kuwait time. This method is only a safety
   * net for drivers that were activated mid-cycle and still have no OPEN
   * shift; it never closes stale shifts (that is the cron's job).
   */
  async ensureOpenShiftForDriver(driverId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: driverId } });
    if (!user || user.safariRole !== SafariRole.DRIVER) return;

    const open = await this.prisma.shift.findFirst({
      where: { driverId, status: ShiftStatus.OPEN },
      orderBy: { startedAt: 'desc' },
    });
    if (open) return;

    await this.prisma.shift.create({
      data: { driverId, status: ShiftStatus.OPEN },
    });
  }

  async getDailyPosSalesByPaymentMethod(
    fromIso: string,
    toIso: string,
    scopedDriverId?: string,
  ) {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid date range');
    }
    const rows = await this.prisma.order.groupBy({
      by: ['posPaymentMethod'],
      where: {
        status: OrderStatus.COMPLETED,
        completedAt: { gte: from, lte: to },
        ...(scopedDriverId ? { driverId: scopedDriverId } : {}),
      },
      _sum: { totalPrice: true },
      _count: true,
    });
    const mappedRows = rows.map((r) => ({
      posPaymentMethod: r.posPaymentMethod,
      orderCount: r._count,
      totalRevenue:
        r._sum?.totalPrice !== null && r._sum?.totalPrice !== undefined
          ? r._sum.totalPrice.toFixed(4)
          : '0.0000',
    }));

    // V25 — pre-compute aggregates so the frontend renders-only.
    let totalKd = new Prisma.Decimal(0);
    let collectedKd = new Prisma.Decimal(0);
    let onAccountKd = new Prisma.Decimal(0);
    for (const r of mappedRows) {
      const v = new Prisma.Decimal(r.totalRevenue);
      totalKd = totalKd.plus(v);
      if (r.posPaymentMethod === 'DEBT_ON_ACCOUNT') {
        onAccountKd = onAccountKd.plus(v);
      } else {
        collectedKd = collectedKd.plus(v);
      }
    }
    const collectionRateBps =
      totalKd.gt(0)
        ? collectedKd.div(totalKd).times(10000).toDecimalPlaces(0).toNumber()
        : 0;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totals: {
        totalKd: totalKd.toFixed(3),
        collectedKd: collectedKd.toFixed(3),
        onAccountKd: onAccountKd.toFixed(3),
        /** Collection rate in basis points (bps ÷ 100 = %). */
        collectionRateBps,
      },
      rows: mappedRows,
    };
  }

  async getDriverBalances(): Promise<DriverBalanceResponseDto> {
    const drivers = await this.prisma.user.findMany({
      where: { safariRole: SafariRole.DRIVER },
      select: {
        id: true,
        username: true,
        fullName: true,
        employeeId: true,
        phone: true,
        branchId: true,
      },
      orderBy: { username: 'asc' },
    });
    const rows: DriverBalanceRowDto[] = [];
    for (const d of drivers) {
      const shift = await this.prisma.shift.findFirst({
        where: { driverId: d.id, status: ShiftStatus.OPEN },
        orderBy: { startedAt: 'desc' },
      });
      /*
       * Dastur §3 — "Pending invoices" = every COMPLETED order this driver
       * issued whose cashStatus is still PAID_TO_DRIVER (not yet closed by
       * the accountant), split per POS payment method. CASH clears via the
       * handover/custody flow; KNET / PAYMENT_LINK / ONLINE clear when the
       * accountant verifies the matching bank / Z-report deposit.
       */
      const pendingAll = await this.prisma.order.findMany({
        where: {
          driverId: d.id,
          status: OrderStatus.COMPLETED,
          cashStatus: CashStatus.PAID_TO_DRIVER,
        },
        select: { totalPrice: true, posPaymentMethod: true },
      });

      const buckets = {
        cash: [] as { totalPrice: typeof pendingAll[number]['totalPrice'] }[],
        knet: [] as { totalPrice: typeof pendingAll[number]['totalPrice'] }[],
        link: [] as { totalPrice: typeof pendingAll[number]['totalPrice'] }[],
        online: [] as { totalPrice: typeof pendingAll[number]['totalPrice'] }[],
      };
      for (const o of pendingAll) {
        switch (o.posPaymentMethod) {
          case PosPaymentMethod.CASH:
            buckets.cash.push({ totalPrice: o.totalPrice });
            break;
          case PosPaymentMethod.KNET:
            buckets.knet.push({ totalPrice: o.totalPrice });
            break;
          case PosPaymentMethod.PAYMENT_LINK:
            buckets.link.push({ totalPrice: o.totalPrice });
            break;
          case PosPaymentMethod.ONLINE:
            buckets.online.push({ totalPrice: o.totalPrice });
            break;
          default:
            break;
        }
      }

      const cashMinor = sumOrderMinors(buckets.cash);
      const knetMinor = sumOrderMinors(buckets.knet);
      const linkMinor = sumOrderMinors(buckets.link);
      const onlineMinor = sumOrderMinors(buckets.online);
      const totalMinor = cashMinor + knetMinor + linkMinor + onlineMinor;

      rows.push({
        driverId: d.id,
        employeeId: d.employeeId,
        username: d.username,
        fullName: d.fullName,
        phone: d.phone,
        branchId: d.branchId,
        currentShiftId: shift?.id ?? null,
        shiftStartedAt: shift?.startedAt ?? null,
        heldCashTotal: minorToAmountString(cashMinor),
        pendingSettlementOrderCount: buckets.cash.length,
        pendingCashKd: minorToAmountString(cashMinor),
        pendingKnetKd: minorToAmountString(knetMinor),
        pendingLinkKd: minorToAmountString(linkMinor),
        pendingOnlineKd: minorToAmountString(onlineMinor),
        pendingTotalKd: minorToAmountString(totalMinor),
        pendingInvoiceCount:
          buckets.cash.length +
          buckets.knet.length +
          buckets.link.length +
          buckets.online.length,
      });
    }
    return { drivers: rows };
  }

  async getMyDriverCashCustodySummary(driverId: string): Promise<{
    cashTotalKd: string;
    cashOrderCount: number;
    grandTotalKd: string;
  }> {
    const rows = await this.prisma.order.findMany({
      where: {
        driverId,
        status: OrderStatus.COMPLETED,
        cashStatus: CashStatus.PAID_TO_DRIVER,
        posPaymentMethod: PosPaymentMethod.CASH,
      },
      select: { totalPrice: true },
    });
    return computeCanonicalDriverCashCustodySummary(
      rows.map((row) => ({ amountKd: row.totalPrice })),
    );
  }

  async getTotalCashWithDrivers(): Promise<string> {
    const rows = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.COMPLETED,
        cashStatus: CashStatus.PAID_TO_DRIVER,
        posPaymentMethod: PosPaymentMethod.CASH,
      },
      select: { totalPrice: true },
    });
    return minorToAmountString(sumOrderMinors(rows));
  }

  async getDriverMonitoring(branchId: string | null = null) {
    const activeDrivers = await this.prisma.user.findMany({
      where: {
        safariRole: SafariRole.DRIVER,
        shiftsAsDriver: { some: { status: ShiftStatus.OPEN } },
        // V19.22.5 — Branch-scoped map for MANAGER. OWNER / CC / GM
        // pass `null` here and get the full fleet.
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        username: true,
        phone: true,
        vehicleLabel: true,
        lastKnownLocation: true,
        branch: { select: { id: true, name: true, location: true } },
      },
    });
    return {
      drivers: activeDrivers.map((d) => {
        const live = parseLatLng(d.lastKnownLocation);
        const fallback = parseLatLng(d.branch?.location ?? null);
        const location = live ?? fallback;
        return {
          driverId: d.id,
          fullName: d.fullName,
          username: d.username,
          phone: d.phone,
          vehicleLabel: d.vehicleLabel ?? 'Toyota LC300',
          status: 'ON_SHIFT' as const,
          source: live ? ('LIVE_GPS' as const) : ('BRANCH_FALLBACK' as const),
          lastKnownLocation: live,
          markerLocation: location,
          branch: d.branch,
        };
      }),
    };
  }

  async updateDriverTracking(driverId: string, dto: UpdateDriverTrackingDto) {
    const driver = await this.prisma.user.findUnique({
      where: { id: driverId },
      select: { id: true, safariRole: true },
    });
    if (!driver || driver.safariRole !== SafariRole.DRIVER) {
      throw new NotFoundException('Driver not found');
    }
    if (
      dto.lastKnownLocation !== undefined &&
      dto.lastKnownLocation.trim().length > 0 &&
      !parseLatLng(dto.lastKnownLocation)
    ) {
      throw new BadRequestException('lastKnownLocation must be "lat,lng"');
    }
    return this.prisma.user.update({
      where: { id: driverId },
      data: {
        ...(dto.vehicleLabel !== undefined
          ? { vehicleLabel: dto.vehicleLabel.trim() || null }
          : {}),
        ...(dto.lastKnownLocation !== undefined
          ? { lastKnownLocation: dto.lastKnownLocation.trim() || null }
          : {}),
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        vehicleLabel: true,
        lastKnownLocation: true,
      },
    });
  }

  /**
   * Dastur §3 — Cash handover from driver to manager.
   *
   * Cash custody is INDEPENDENT of the driver's shift. This method:
   *   • Flips every PAID_TO_DRIVER cash order to HANDED_OVER_TO_OFFICE.
   *   • Creates a ManagerCashCustody bag so the aging clock starts.
   *   • Stamps the driver's currently-open shift id onto the orders for
   *     audit (`handoverShiftId`) — this is a READ-ONLY link, we never
   *     mutate shift.status / endedAt / systemHandoverTotal here.
   *
   * The shift itself is owned by the financial cycle (midnight → midnight,
   * Kuwait time) and is closed by the daily OWNER job, not by this event.
   * Cash can sit with the manager for multiple days and be deposited later.
   */
  async confirmHandover(
    managerId: string,
    actorRole: SafariRole,
    dto: ConfirmHandoverDto,
  ): Promise<HandoverResultDto> {
    assertInstitutionalMutationAllowed(actorRole);
    const driver = await this.prisma.user.findUnique({
      where: { id: dto.driverId },
    });
    if (!driver || driver.safariRole !== SafariRole.DRIVER) {
      throw new NotFoundException('Driver not found');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const pending = await tx.order.findMany({
        where: {
          driverId: dto.driverId,
          status: OrderStatus.COMPLETED,
          cashStatus: CashStatus.PAID_TO_DRIVER,
          posPaymentMethod: PosPaymentMethod.CASH,
        },
        select: { id: true, totalPrice: true },
      });
      const systemMinor = sumOrderMinors(pending);
      if (dto.declaredHandoverTotal !== undefined) {
        try {
          assertDeclaredMatchesLedgerMinor(systemMinor, dto.declaredHandoverTotal);
        } catch (e) {
          throw new BadRequestException(
            e instanceof Error ? e.message : 'Declared total mismatch',
          );
        }
      }

      // Informational stamp only — handover does not require an OPEN shift
      // and does not close one when found.
      const shift = await tx.shift.findFirst({
        where: { driverId: dto.driverId, status: ShiftStatus.OPEN },
        orderBy: { startedAt: 'desc' },
      });

      if (pending.length === 0) {
        return {
          settledOrderCount: 0,
          systemHandoverTotal: '0.0000',
          shiftId: shift?.id ?? null,
          bankDepositReceiptUrl: dto.depositReceiptUrl ?? null,
          custodyBagId: null as string | null,
          branchId: null as string | null,
        };
      }

      const ids = pending.map((o) => o.id);
      const updated = await tx.order.updateMany({
        where: {
          id: { in: ids },
          cashStatus: CashStatus.PAID_TO_DRIVER,
          posPaymentMethod: PosPaymentMethod.CASH,
        },
        data: {
          cashStatus: CashStatus.HANDED_OVER_TO_OFFICE,
          handoverShiftId: shift?.id ?? null,
        },
      });
      if (updated.count !== pending.length) {
        throw new ConflictException(
          'Concurrent handover detected; not all orders could be settled. Retry.',
        );
      }
      const systemHandoverTotal = minorToAmountString(systemMinor);

      // Dastur §3 — create the manager custody bag so aging can run.
      // Slip-first legacy flow → AWAITING_VERIFICATION when a slip was provided,
      // otherwise PENDING_DEPOSIT for the two-step flow.
      const manager = await tx.user.findUnique({
        where: { id: managerId },
        select: { branchId: true },
      });
      const hasSlip = Boolean(dto.depositReceiptUrl);
      const branchId = manager?.branchId ?? driver.branchId ?? null;
      const bag = await tx.managerCashCustody.create({
        data: {
          managerId,
          driverId: dto.driverId,
          branchId,
          shiftId: shift?.id ?? null,
          amountKd: systemHandoverTotal,
          settledOrderCount: pending.length,
          status: hasSlip
            ? ManagerCashCustodyStatus.AWAITING_VERIFICATION
            : ManagerCashCustodyStatus.PENDING_DEPOSIT,
          depositSlipUrl: dto.depositReceiptUrl ?? null,
          slipUploadedAt: hasSlip ? new Date() : null,
        },
        select: { id: true },
      });

      return {
        settledOrderCount: pending.length,
        systemHandoverTotal,
        shiftId: shift?.id ?? null,
        bankDepositReceiptUrl: dto.depositReceiptUrl ?? null,
        custodyBagId: bag.id,
        branchId,
      };
    });

    // Canonical AuditLog at the TRANSFER boundary (driver -> branch).
    // Emitted ONLY on a non-empty settlement so we don't pollute the
    // log with no-op handover attempts. The actor is the manager (the
    // user who pressed the button); the driver is recorded in the
    // structured `changes` payload as the cash holder, NOT as actor.
    // The custody bag id is included so an auditor can chain TRANSFER
    // -> DEPOSIT -> bank deposit verification end-to-end.
    if (result.settledOrderCount > 0) {
      this.auditLogs.logFinancialEvent({
        action: 'CASH_HANDOVER_TRANSFER',
        userId: managerId,
        role: actorRole,
        amount: result.systemHandoverTotal,
        source: 'DRIVER_TO_BRANCH_HANDOVER',
        changes: {
          driverId: dto.driverId,
          branchId: result.branchId,
          custodyBagId: result.custodyBagId,
          shiftId: result.shiftId,
          settledOrderCount: result.settledOrderCount,
          declaredHandoverTotal: dto.declaredHandoverTotal ?? null,
          depositReceiptProvided: Boolean(dto.depositReceiptUrl),
        },
      });
    }

    return {
      settledOrderCount: result.settledOrderCount,
      systemHandoverTotal: result.systemHandoverTotal,
      shiftId: result.shiftId,
      bankDepositReceiptUrl: result.bankDepositReceiptUrl,
    };
  }

  /**
   * V19.10 — "Driver Cash Trace" report.
   *
   * Answers the owner's question:
   *   "How much cash did each driver physically collect in <window>,
   *    did they hand it to a branch manager, and did it reach the bank?"
   *
   * Per driver, we return:
   *   - collectedKd              — sum of COMPLETED CASH orders whose
   *     `completedAt` lies in [from, to].
   *   - handedToManagerKd        — sum of ManagerCashCustody rows with
   *     `receivedFromDriverAt` in [from, to], regardless of status.
   *   - pendingWithDriverKd      — `max(0, collected - handed)`. This
   *     is the cash the driver still physically holds for work done in
   *     the window.
   *   - atBankKd                 — VERIFIED custody bags.
   *   - pendingAtManagerKd       — PENDING_DEPOSIT custody bags.
   *   - awaitingVerificationKd   — AWAITING_VERIFICATION custody bags.
   *   - rejectedKd               — REJECTED custody bags (back under
   *     manager liability; Dastur §3).
   *
   * The per-bag detail list is returned too, so the UI can show exactly
   * which handover event belongs to which day / which manager. This is
   * what lets the owner select a specific day and see the trail.
   */
  async getDriverCashTrace(
    query: DriverCashTraceQueryDto,
  ): Promise<DriverCashTraceResponseDto> {
    const from = new Date(query.from);
    const to = new Date(query.to);

    // 1) Drivers in scope -------------------------------------------------
    const driversRaw = await this.prisma.user.findMany({
      where: {
        safariRole: SafariRole.DRIVER,
        ...(query.driverId ? { id: query.driverId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        branchId: true,
        branch: { select: { id: true, name: true } },
      },
      orderBy: { fullName: 'asc' },
    });
    if (driversRaw.length === 0) {
      return {
        range: { from: from.toISOString(), to: to.toISOString() },
        kpis: zeroKpis(),
        drivers: [],
      };
    }
    const driverIds = driversRaw.map((d) => d.id);

    // 2) Cash collected per driver in window (COMPLETED + CASH) ----------
    const collectedAgg = await this.prisma.order.groupBy({
      by: ['driverId'],
      where: {
        driverId: { in: driverIds },
        posPaymentMethod: PosPaymentMethod.CASH,
        status: OrderStatus.COMPLETED,
        completedAt: { gte: from, lte: to },
      },
      _sum: { totalPrice: true },
      _count: { _all: true },
    });
    const collectedByDriver = new Map<
      string,
      { kd: string; count: number }
    >();
    for (const row of collectedAgg) {
      if (!row.driverId) continue;
      collectedByDriver.set(row.driverId, {
        kd: row._sum.totalPrice?.toString() ?? '0',
        count: row._count._all,
      });
    }

    // 3) Custody bags for these drivers in window ------------------------
    const bags = await this.prisma.managerCashCustody.findMany({
      where: {
        driverId: { in: driverIds },
        receivedFromDriverAt: { gte: from, lte: to },
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      select: {
        id: true,
        driverId: true,
        managerId: true,
        branchId: true,
        amountKd: true,
        settledOrderCount: true,
        status: true,
        receivedFromDriverAt: true,
        slipUploadedAt: true,
        verifiedAt: true,
        rejectedAt: true,
        rejectionReason: true,
        manager: { select: { id: true, username: true, fullName: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { receivedFromDriverAt: 'asc' },
    });
    const bagsByDriver = new Map<string, DriverCashTraceBagDto[]>();
    for (const bag of bags) {
      const list = bagsByDriver.get(bag.driverId) ?? [];
      list.push({
        id: bag.id,
        amountKd: bag.amountKd.toString(),
        settledOrderCount: bag.settledOrderCount,
        status: bag.status,
        managerId: bag.manager?.id ?? null,
        managerName: bag.manager?.fullName ?? null,
        managerUsername: bag.manager?.username ?? null,
        branchId: bag.branch?.id ?? null,
        branchName: bag.branch?.name ?? null,
        receivedFromDriverAt: bag.receivedFromDriverAt.toISOString(),
        slipUploadedAt: bag.slipUploadedAt?.toISOString() ?? null,
        verifiedAt: bag.verifiedAt?.toISOString() ?? null,
        rejectedAt: bag.rejectedAt?.toISOString() ?? null,
        rejectionReason: bag.rejectionReason ?? null,
      });
      bagsByDriver.set(bag.driverId, list);
    }

    // 4) Per-driver rollup -----------------------------------------------
    const drivers: DriverCashTraceDriverDto[] = driversRaw.map((d) => {
      const collected = collectedByDriver.get(d.id) ?? { kd: '0', count: 0 };
      const list = bagsByDriver.get(d.id) ?? [];

      const handedToManagerKd = sumKd(list.map((b) => b.amountKd));
      const atBankKd = sumKd(
        list.filter((b) => b.status === 'VERIFIED').map((b) => b.amountKd),
      );
      const pendingAtManagerKd = sumKd(
        list
          .filter((b) => b.status === 'PENDING_DEPOSIT')
          .map((b) => b.amountKd),
      );
      const awaitingVerificationKd = sumKd(
        list
          .filter((b) => b.status === 'AWAITING_VERIFICATION')
          .map((b) => b.amountKd),
      );
      const rejectedKd = sumKd(
        list.filter((b) => b.status === 'REJECTED').map((b) => b.amountKd),
      );

      // V23.2 — Decimal-precise pending-with-driver computation.
      // The prior `Number(...) - Number(...)` boundary collapsed
      // both money strings through JS double precision and could
      // mis-classify residues of fractional fils as "pending."
      const diffDecimal = new Prisma.Decimal(collected.kd).minus(
        new Prisma.Decimal(handedToManagerKd),
      );
      const pendingWithDriverKd = diffDecimal.greaterThan(0)
        ? diffDecimal.toFixed(4)
        : '0.0000';

      return {
        driverId: d.id,
        username: d.username,
        fullName: d.fullName,
        branchId: d.branch?.id ?? null,
        branchName: d.branch?.name ?? null,
        collectedKd: collected.kd,
        collectedOrderCount: collected.count,
        handedToManagerKd,
        handedToManagerBagCount: list.length,
        pendingWithDriverKd,
        atBankKd,
        pendingAtManagerKd,
        awaitingVerificationKd,
        rejectedKd,
        bags: list,
      };
    });

    // V23.2 — Decimal-precise activity threshold; the prior
    // `Number(d.collectedKd) > 0` boundary tripped on tiny rounding
    // noise (e.g. 0.0001 fils carry-overs).
    const active = drivers.filter(
      (d) =>
        new Prisma.Decimal(d.collectedKd).greaterThan(0) ||
        d.bags.length > 0 ||
        d.collectedOrderCount > 0,
    );

    // 5) Totals ----------------------------------------------------------
    const kpis = {
      totalCollectedKd: sumKd(active.map((d) => d.collectedKd)),
      totalHandedToManagerKd: sumKd(active.map((d) => d.handedToManagerKd)),
      totalAtBankKd: sumKd(active.map((d) => d.atBankKd)),
      totalPendingWithDriverKd: sumKd(active.map((d) => d.pendingWithDriverKd)),
      totalPendingAtManagerKd: sumKd(active.map((d) => d.pendingAtManagerKd)),
      totalAwaitingVerificationKd: sumKd(
        active.map((d) => d.awaitingVerificationKd),
      ),
      totalRejectedKd: sumKd(active.map((d) => d.rejectedKd)),
      totalCollectedOrderCount: active.reduce(
        (n, d) => n + d.collectedOrderCount,
        0,
      ),
      totalBagCount: active.reduce((n, d) => n + d.bags.length, 0),
    };

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      kpis,
      drivers: active,
    };
  }

  /**
   * V19.31 — Reconciliation snapshot: window events vs open balances (now).
   */
  async getCashReconciliationSnapshot(
    query: DriverCashTraceQueryDto,
  ): Promise<CashReconciliationSnapshotDto> {
    const trace = await this.getDriverCashTrace(query);
    const [pendingDriversKd, depRejected, awaiting] = await Promise.all([
      this.getTotalCashWithDrivers(),
      this.prisma.managerCashCustody.aggregate({
        where: {
          status: {
            in: [
              ManagerCashCustodyStatus.PENDING_DEPOSIT,
              ManagerCashCustodyStatus.REJECTED,
            ],
          },
        },
        _sum: { amountKd: true },
        _count: { _all: true },
      }),
      this.prisma.managerCashCustody.aggregate({
        where: { status: ManagerCashCustodyStatus.AWAITING_VERIFICATION },
        _sum: { amountKd: true },
        _count: { _all: true },
      }),
    ]);
    const depRejectedKd =
      depRejected._sum.amountKd !== null && depRejected._sum.amountKd !== undefined
        ? depRejected._sum.amountKd.toFixed(4)
        : '0.0000';
    const awaitingKd =
      awaiting._sum.amountKd !== null && awaiting._sum.amountKd !== undefined
        ? awaiting._sum.amountKd.toFixed(4)
        : '0.0000';

    return {
      range: trace.range,
      notes: [
        'eventBasedInRange uses completedAt (collected) and receivedFromDriverAt (handed) inside [from, to].',
        'stateBasedNow.pendingWithDriversKd is current driver field cash (PAID_TO_DRIVER), not window-scoped.',
        'stateBasedNow.pendingWithManagers* uses open custody rows by status (deposit/rejected vs awaiting verification).',
      ],
      eventBasedInRange: {
        collectedKd: trace.kpis.totalCollectedKd,
        handedToManagerKd: trace.kpis.totalHandedToManagerKd,
        collectedOrderCount: trace.kpis.totalCollectedOrderCount,
        handedBagCount: trace.kpis.totalBagCount,
      },
      stateBasedNow: {
        pendingWithDriversKd: pendingDriversKd,
        pendingWithManagersDepositOrRejectedKd: depRejectedKd,
        pendingWithManagersDepositOrRejectedBagCount: depRejected._count._all,
        awaitingVerificationKd: awaitingKd,
        awaitingVerificationBagCount: awaiting._count._all,
      },
      driverCashTraceKpis: trace.kpis,
    };
  }

  async getOwnerFinancialCycleReport() {
    // Dastur §3 — handover info (who collected & when) now lives on the
    // ManagerCashCustody bag, since cash is independent of shift lifecycle.
    // We also carry the legacy shift fields as fallback for rows created
    // before the decoupling migration landed.
    const rows = await this.prisma.order.findMany({
      where: {
        posPaymentMethod: PosPaymentMethod.CASH,
        handoverShiftId: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
      select: {
        id: true,
        totalPrice: true,
        updatedAt: true,
        handoverShift: {
          select: {
            id: true,
            confirmedAt: true,
            confirmedByManager: {
              select: { id: true, fullName: true, username: true },
            },
            managerCustodyBags: {
              orderBy: { receivedFromDriverAt: 'desc' },
              take: 1,
              select: {
                receivedFromDriverAt: true,
                manager: {
                  select: { id: true, fullName: true, username: true },
                },
              },
            },
            bankDepositLogs: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                receiptImageUrl: true,
                verifiedAt: true,
                verifiedByAccountant: {
                  select: { id: true, fullName: true, username: true },
                },
              },
            },
          },
        },
      },
    });
    return {
      rows: rows.map((o) => {
        const shift = o.handoverShift;
        const bag = shift?.managerCustodyBags[0] ?? null;
        const deposit = shift?.bankDepositLogs[0] ?? null;
        return {
          orderId: o.id,
          amountKd: o.totalPrice.toString(),
          collectedAt:
            bag?.receivedFromDriverAt?.toISOString() ??
            shift?.confirmedAt?.toISOString() ??
            null,
          collectedByManager: bag?.manager ?? shift?.confirmedByManager ?? null,
          depositLogId: deposit?.id ?? null,
          receiptImageUrl: deposit?.receiptImageUrl ?? null,
          verifiedAt: deposit?.verifiedAt?.toISOString() ?? null,
          verifiedByAccountant: deposit?.verifiedByAccountant ?? null,
          lastUpdatedAt: o.updatedAt.toISOString(),
        };
      }),
    };
  }
}

