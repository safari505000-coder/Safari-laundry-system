import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CashStatus,
  ManagerCashCustodyStatus,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KUWAIT_OFFSET_MIN } from '../common/time/kuwait-time';
import {
  CashControlAlertDto,
  CashDriverBreakdownDto,
  CashFlowControlDto,
  CashReconciliationDto,
  CashReconciliationStatus,
  CashResponsibilityDto,
  CashSeverity,
  CashTimelineEventDto,
  CashTimelineResponseDto,
} from './dto/cash-control.dto';
import { AccountingScopeType } from './dto/accounting-query.dto';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const CRITICAL_MINOR = 50_0000; // 50 KD in fixed-4 minor units.

type DayRange = { from: Date; to: Date; date: string };
type CashScope = {
  scopeType?: AccountingScopeType | 'ALL' | 'BRANCH' | 'DRIVER';
  branchId?: string;
  driverId?: string;
};

function fixed4ToMinor(value: Prisma.Decimal | string | number | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  const raw =
    typeof value === 'string' ? value : (
      typeof value === 'number' ? value.toFixed(4) : value.toFixed(4)
    );
  const sign = raw.trim().startsWith('-') ? -1n : 1n;
  const clean = raw.trim().replace(/^-/, '');
  const [whole, frac = ''] = clean.split('.');
  const frac4 = `${frac}0000`.slice(0, 4);
  return sign * (BigInt(whole || '0') * 10_000n + BigInt(frac4));
}

function minorToFixed4(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  const whole = abs / 10_000n;
  const frac = (abs % 10_000n).toString().padStart(4, '0');
  return `${sign}${whole}.${frac}`;
}

function absMinor(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function addToMap(map: Map<string, bigint>, key: string, amount: bigint) {
  map.set(key, (map.get(key) ?? 0n) + amount);
}

function parseKuwaitDay(date: string): DayRange {
  const day = date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new BadRequestException('date must be YYYY-MM-DD');
  }
  const [year, month, d] = day.split('-').map(Number);
  const from = new Date(
    Date.UTC(year, month - 1, d, 0, 0, 0, 0) - KUWAIT_OFFSET_MIN * 60_000,
  );
  return { from, to: new Date(from.getTime() + DAY_MS), date: day };
}

function statusFor(...diffs: bigint[]): CashReconciliationStatus {
  const max = diffs.reduce((m, d) => (absMinor(d) > m ? absMinor(d) : m), 0n);
  if (max === 0n) return 'OK';
  return max >= BigInt(CRITICAL_MINOR) ? 'CRITICAL' : 'MISMATCH';
}

function severityFor(amount: bigint, delayHours: number): CashSeverity {
  if (absMinor(amount) >= BigInt(CRITICAL_MINOR) || delayHours >= 48) return 'HIGH';
  if (absMinor(amount) > 0n || delayHours >= 24) return 'MEDIUM';
  return 'LOW';
}

function normalizeScope(scope?: string | CashScope): CashScope {
  if (typeof scope === 'string') {
    return { scopeType: AccountingScopeType.BRANCH, branchId: scope };
  }
  const scopeType = scope?.scopeType ?? (
    scope?.driverId ? AccountingScopeType.DRIVER : (
      scope?.branchId ? AccountingScopeType.BRANCH : AccountingScopeType.ALL
    )
  );
  if (scopeType === AccountingScopeType.DRIVER) {
    return { scopeType, driverId: scope?.driverId };
  }
  if (scopeType === AccountingScopeType.BRANCH) {
    return { scopeType, branchId: scope?.branchId };
  }
  return { scopeType: AccountingScopeType.ALL };
}

function orderScopeWhere(scope: CashScope): Prisma.OrderWhereInput {
  if (scope.scopeType === AccountingScopeType.DRIVER && scope.driverId) {
    return { driverId: scope.driverId };
  }
  if (scope.scopeType === AccountingScopeType.BRANCH && scope.branchId) {
    return { driver: { branchId: scope.branchId } };
  }
  return {};
}

function custodyScopeWhere(scope: CashScope): Prisma.ManagerCashCustodyWhereInput {
  if (scope.scopeType === AccountingScopeType.DRIVER && scope.driverId) {
    return { driverId: scope.driverId };
  }
  if (scope.scopeType === AccountingScopeType.BRANCH && scope.branchId) {
    return { branchId: scope.branchId };
  }
  return {};
}

function bankScopeWhere(scope: CashScope): Prisma.BankDepositLogWhereInput {
  if (scope.scopeType === AccountingScopeType.DRIVER && scope.driverId) {
    return { shift: { handoverOrders: { some: { driverId: scope.driverId } } } };
  }
  if (scope.scopeType === AccountingScopeType.BRANCH && scope.branchId) {
    return {
      shift: { handoverOrders: { some: { driver: { branchId: scope.branchId } } } },
    };
  }
  return {};
}

@Injectable()
export class AccountingReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async computeCashReconciliation(
    day: string,
    scopeInput?: string | CashScope,
  ): Promise<CashReconciliationDto> {
    const range = parseKuwaitDay(day);
    const scope = normalizeScope(scopeInput);
    const custodyWhere: Prisma.ManagerCashCustodyWhereInput = {
      receivedFromDriverAt: { gte: range.from, lt: range.to },
      ...custodyScopeWhere(scope),
    };

    const custodies = await this.prisma.managerCashCustody.findMany({
      where: custodyWhere,
      select: {
        id: true,
        amountKd: true,
        driverId: true,
        shiftId: true,
        depositSlipUrl: true,
        receivedFromDriverAt: true,
        slipUploadedAt: true,
        status: true,
        driver: { select: { id: true, fullName: true, username: true } },
        bankDepositLog: {
          select: {
            id: true,
            status: true,
            amountKd: true,
            verifiedAt: true,
          },
        },
      },
    });
    const shiftIds = [
      ...new Set(custodies.map((bag) => bag.shiftId).filter((id): id is string => Boolean(id))),
    ];
    const [orders, deposits] =
      shiftIds.length > 0
        ? await Promise.all([
            this.prisma.order.findMany({
              where: {
                status: OrderStatus.COMPLETED,
                posPaymentMethod: PosPaymentMethod.CASH,
                handoverShiftId: { in: shiftIds },
                ...orderScopeWhere(scope),
              },
              select: {
                id: true,
                totalPrice: true,
                driverId: true,
                cashStatus: true,
                updatedAt: true,
                handoverShiftId: true,
                completedAt: true,
                driver: { select: { id: true, fullName: true, username: true } },
              },
            }),
            this.prisma.bankDepositLog.findMany({
              where: { shiftId: { in: shiftIds }, ...bankScopeWhere(scope) },
              select: {
                id: true,
                amountKd: true,
                shiftId: true,
                managerCashCustodyId: true,
                status: true,
                createdAt: true,
                verifiedAt: true,
              },
            }),
          ])
        : [[], []];

    const collectedByDriver = new Map<string, bigint>();
    const handedByDriver = new Map<string, bigint>();
    const driverNames = new Map<string, string | null>();
    let expectedCash = 0n;
    let handedToBranch = 0n;

    for (const order of orders) {
      const amount = fixed4ToMinor(order.totalPrice);
      expectedCash += amount;
      if (order.driverId) {
        addToMap(collectedByDriver, order.driverId, amount);
        driverNames.set(order.driverId, order.driver?.fullName ?? order.driver?.username ?? null);
        if (order.cashStatus === CashStatus.HANDED_OVER_TO_OFFICE) {
          handedToBranch += amount;
          addToMap(handedByDriver, order.driverId, amount);
        }
      }
    }

    let receivedByManager = 0n;
    for (const bag of custodies) {
      const amount = fixed4ToMinor(bag.amountKd);
      receivedByManager += amount;
      driverNames.set(bag.driverId, bag.driver?.fullName ?? bag.driver?.username ?? null);
    }

    const depositedToBank = deposits.reduce(
      (sum, deposit) => sum + fixed4ToMinor(deposit.amountKd),
      0n,
    );
    const differenceDriver = expectedCash - handedToBranch;
    const differenceBranch = handedToBranch - receivedByManager;
    const differenceBank = receivedByManager - depositedToBank;
    const totalDifference = differenceDriver + differenceBranch + differenceBank;
    const status = statusFor(differenceDriver, differenceBranch, differenceBank);
    const breakdown = this.buildBreakdown(collectedByDriver, handedByDriver, driverNames);
    const flows = this.buildFlows(custodies, orders, deposits);
    const accountability = this.buildAccountability(
      differenceDriver,
      differenceBranch,
      differenceBank,
      custodies,
    );

    return {
      date: range.date,
      branchId: scope.scopeType === AccountingScopeType.BRANCH ? scope.branchId ?? null : null,
      expectedCash: minorToFixed4(expectedCash),
      collectedByDrivers: minorToFixed4(expectedCash),
      handedToBranch: minorToFixed4(handedToBranch),
      receivedByManager: minorToFixed4(receivedByManager),
      depositedToBank: minorToFixed4(depositedToBank),
      differenceDriver: minorToFixed4(differenceDriver),
      differenceBranch: minorToFixed4(differenceBranch),
      differenceBank: minorToFixed4(differenceBank),
      totalDifference: minorToFixed4(totalDifference),
      status,
      breakdown,
      accountability,
      alerts: this.buildAlerts(differenceDriver, differenceBank, custodies, deposits),
      depositStatus: this.overallDepositStatus(flows),
      auditComplete: flows.every((flow) => flow.auditComplete),
      flows,
      reconciliationMode: 'flow_based',
      ignoredTimingMismatch: true,
      actionsTaken: ['logic_fixed', 'links_validated', 'deposit_validated'],
    };
  }

  async getCashTimeline(params: {
    date: string;
    scopeType?: AccountingScopeType | 'ALL' | 'BRANCH' | 'DRIVER';
    driverId?: string;
    branchId?: string;
  }): Promise<CashTimelineResponseDto> {
    const range = parseKuwaitDay(params.date);
    const scope = normalizeScope(params);
    const custodies = await this.prisma.managerCashCustody.findMany({
      where: {
        receivedFromDriverAt: { gte: range.from, lt: range.to },
        ...custodyScopeWhere(scope),
      },
      select: {
        id: true,
        amountKd: true,
        managerId: true,
        shiftId: true,
        receivedFromDriverAt: true,
        slipUploadedAt: true,
        verifiedAt: true,
        verifiedByAccountantId: true,
      },
    });
    const shiftIds = [
      ...new Set(custodies.map((bag) => bag.shiftId).filter((id): id is string => Boolean(id))),
    ];
    const [orders, deposits] =
      shiftIds.length > 0
        ? await Promise.all([
            this.prisma.order.findMany({
              where: {
                status: OrderStatus.COMPLETED,
                posPaymentMethod: PosPaymentMethod.CASH,
                handoverShiftId: { in: shiftIds },
                ...orderScopeWhere(scope),
              },
              select: {
                id: true,
                totalPrice: true,
                completedAt: true,
                driverId: true,
                cashStatus: true,
                updatedAt: true,
              },
            }),
            this.prisma.bankDepositLog.findMany({
              where: { shiftId: { in: shiftIds }, ...bankScopeWhere(scope) },
              select: { id: true, amountKd: true, uploadedById: true, createdAt: true },
            }),
          ])
        : [[], []];

    const events: CashTimelineEventDto[] = [];
    for (const order of orders) {
      if (!order.completedAt) continue;
      events.push({
        type: 'ORDER_COLLECTED',
        timestamp: order.completedAt.toISOString(),
        amount: order.totalPrice.toFixed(4),
        userId: order.driverId,
        sourceId: order.id,
      });
      if (order.cashStatus === CashStatus.HANDED_OVER_TO_OFFICE) {
        events.push({
          type: 'DRIVER_HANDOVER',
          timestamp: order.updatedAt.toISOString(),
          amount: order.totalPrice.toFixed(4),
          userId: order.driverId,
          sourceId: order.id,
        });
      }
    }
    for (const bag of custodies) {
      events.push({
        type: 'MANAGER_CONFIRMED',
        timestamp: bag.receivedFromDriverAt.toISOString(),
        amount: bag.amountKd.toFixed(4),
        userId: bag.managerId,
        sourceId: bag.id,
      });
    }
    for (const deposit of deposits) {
      events.push({
        type: 'BANK_DEPOSITED',
        timestamp: deposit.createdAt.toISOString(),
        amount: deposit.amountKd.toFixed(4),
        userId: deposit.uploadedById,
        sourceId: deposit.id,
      });
    }
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return { events };
  }

  async getDiscrepancies(): Promise<{ generatedAt: string; discrepancies: CashResponsibilityDto[] }> {
    const today = new Date();
    const day = new Date(today.getTime() + KUWAIT_OFFSET_MIN * 60_000)
      .toISOString()
      .slice(0, 10);
    const reconciliation = await this.computeCashReconciliation(day);
    return {
      generatedAt: today.toISOString(),
      discrepancies: reconciliation.accountability,
    };
  }

  private buildBreakdown(
    collectedByDriver: Map<string, bigint>,
    handedByDriver: Map<string, bigint>,
    driverNames: Map<string, string | null>,
  ): CashDriverBreakdownDto[] {
    const ids = new Set([...collectedByDriver.keys(), ...handedByDriver.keys()]);
    return [...ids].map((driverId) => {
      const collected = collectedByDriver.get(driverId) ?? 0n;
      const handed = handedByDriver.get(driverId) ?? 0n;
      const difference = collected - handed;
      return {
        driverId,
        driverName: driverNames.get(driverId) ?? null,
        collected: minorToFixed4(collected),
        handed: minorToFixed4(handed),
        difference: minorToFixed4(difference),
        status: statusFor(difference),
      };
    });
  }

  private buildFlows(
    custodies: {
      id: string;
      amountKd: Prisma.Decimal;
      shiftId: string | null;
      depositSlipUrl: string | null;
      status: ManagerCashCustodyStatus;
      bankDepositLog: {
        id: string;
        status: 'PENDING' | 'VERIFIED';
        amountKd: Prisma.Decimal;
        verifiedAt: Date | null;
      } | null;
    }[],
    orders: { totalPrice: Prisma.Decimal; handoverShiftId: string | null }[],
    deposits: {
      id: string;
      amountKd: Prisma.Decimal;
      shiftId: string | null;
      managerCashCustodyId: string | null;
      status: 'PENDING' | 'VERIFIED';
      verifiedAt: Date | null;
    }[],
  ): CashFlowControlDto[] {
    return custodies.map((bag) => {
      const linkedOrdersTotalMinor = orders
        .filter((order) => order.handoverShiftId !== null && order.handoverShiftId === bag.shiftId)
        .reduce((sum, order) => sum + fixed4ToMinor(order.totalPrice), 0n);
      const custodyMinor = fixed4ToMinor(bag.amountKd);
      const deposit =
        bag.bankDepositLog ??
        deposits.find((row) => row.managerCashCustodyId === bag.id) ??
        deposits.find((row) => row.shiftId !== null && row.shiftId === bag.shiftId) ??
        null;
      const depositMinor = deposit ? fixed4ToMinor(deposit.amountKd) : null;
      const anomalyFlags: string[] = [];
      if (!bag.shiftId) anomalyFlags.push('MISSING_SHIFT_LINK');
      if (linkedOrdersTotalMinor !== custodyMinor) anomalyFlags.push('CUSTODY_ORDER_AMOUNT_MISMATCH');
      if (bag.status === ManagerCashCustodyStatus.VERIFIED && bag.depositSlipUrl && !deposit) {
        anomalyFlags.push('DEPOSIT_NOT_REGISTERED');
      }
      if (depositMinor !== null && depositMinor !== custodyMinor) {
        anomalyFlags.push('DEPOSIT_AMOUNT_MISMATCH');
      }
      if (deposit && deposit.status === 'PENDING') {
        anomalyFlags.push('DEPOSIT_PENDING_VERIFICATION');
      }
      const depositStatus =
        !deposit ? 'MISSING'
        : depositMinor !== custodyMinor ? 'AMOUNT_MISMATCH'
        : deposit.status;
      return {
        custodyId: bag.id,
        shiftId: bag.shiftId,
        custodyAmount: minorToFixed4(custodyMinor),
        linkedOrdersTotal: minorToFixed4(linkedOrdersTotalMinor),
        depositId: deposit?.id ?? null,
        depositStatus,
        auditComplete:
          anomalyFlags.length === 0 &&
          (!deposit || deposit.status !== 'VERIFIED' || Boolean(deposit.verifiedAt)),
        anomalyFlags,
      };
    });
  }

  private overallDepositStatus(
    flows: CashFlowControlDto[],
  ): 'MISSING' | 'PENDING' | 'VERIFIED' | 'MIXED' {
    if (flows.length === 0) return 'MISSING';
    const statuses = new Set(flows.map((flow) => flow.depositStatus));
    if (statuses.size === 1) {
      const [status] = [...statuses];
      return status === 'AMOUNT_MISMATCH' ? 'MIXED' : status;
    }
    return 'MIXED';
  }

  private buildAccountability(
    differenceDriver: bigint,
    differenceBranch: bigint,
    differenceBank: bigint,
    custodies: { receivedFromDriverAt: Date; slipUploadedAt: Date | null; status: ManagerCashCustodyStatus }[],
  ): CashResponsibilityDto[] {
    const now = Date.now();
    const maxDelay = custodies.reduce((max, bag) => {
      if (bag.status === ManagerCashCustodyStatus.VERIFIED) return max;
      return Math.max(max, Math.floor((now - bag.receivedFromDriverAt.getTime()) / HOUR_MS));
    }, 0);
    const rows: CashResponsibilityDto[] = [];
    if (differenceDriver !== 0n) {
      rows.push({
        responsible: 'DRIVER',
        amount: minorToFixed4(differenceDriver),
        delayHours: maxDelay,
        severity: severityFor(differenceDriver, maxDelay),
      });
    }
    if (differenceBranch !== 0n) {
      rows.push({
        responsible: 'BRANCH',
        amount: minorToFixed4(differenceBranch),
        delayHours: maxDelay,
        severity: severityFor(differenceBranch, maxDelay),
      });
    }
    if (differenceBank !== 0n) {
      rows.push({
        responsible: 'ACCOUNTING',
        amount: minorToFixed4(differenceBank),
        delayHours: maxDelay,
        severity: severityFor(differenceBank, maxDelay),
      });
    }
    return rows;
  }

  private buildAlerts(
    differenceDriver: bigint,
    differenceBank: bigint,
    custodies: {
      id: string;
      amountKd: Prisma.Decimal;
      shiftId: string | null;
      depositSlipUrl: string | null;
      receivedFromDriverAt: Date;
      slipUploadedAt: Date | null;
      status: ManagerCashCustodyStatus;
    }[],
    deposits: { shiftId: string | null }[],
  ): CashControlAlertDto[] {
    const now = Date.now();
    const alerts: CashControlAlertDto[] = [];
    if (differenceDriver > 0n) {
      alerts.push({
        type: 'MISSING_HANDOVER',
        severity: severityFor(differenceDriver, 0),
        entityId: 'driver-cash',
        message: `Drivers have not handed over ${minorToFixed4(differenceDriver)} KD.`,
      });
    }
    if (differenceBank > 0n) {
      alerts.push({
        type: 'PARTIAL_DEPOSIT',
        severity: severityFor(differenceBank, 0),
        entityId: 'bank-deposit',
        message: `Bank deposits are short by ${minorToFixed4(differenceBank)} KD.`,
      });
    }
    for (const bag of custodies) {
      const delayHours = Math.floor((now - bag.receivedFromDriverAt.getTime()) / HOUR_MS);
      const hasLinkedBankDeposit = deposits.some(
        (deposit) => deposit.shiftId !== null && deposit.shiftId === bag.shiftId,
      );
      if (
        bag.status === ManagerCashCustodyStatus.VERIFIED &&
        bag.depositSlipUrl &&
        !hasLinkedBankDeposit
      ) {
        alerts.push({
          type: 'DEPOSIT_NOT_REGISTERED',
          severity: 'MEDIUM',
          entityId: bag.id,
          message: `Custody bag ${bag.id} is verified with a deposit slip but has no BankDepositLog row.`,
        });
      }
      if (bag.status !== ManagerCashCustodyStatus.VERIFIED && delayHours >= 24) {
        alerts.push({
          type: 'DELAYED_DEPOSIT',
          severity: severityFor(fixed4ToMinor(bag.amountKd), delayHours),
          entityId: bag.id,
          message: `Custody bag ${bag.id} has been pending for ${delayHours}h.`,
        });
      }
    }
    return alerts;
  }
}
