/* eslint-disable */
// READ-ONLY forensic financial audit. No writes, no mutations.
// Outputs a single strict JSON object on stdout.

'use strict';

const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const KUWAIT_OFFSET_MIN = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseKuwaitDay(input) {
  const day = String(input).slice(0, 10);
  const [year, month, d] = day.split('-').map(Number);
  const from = new Date(
    Date.UTC(year, month - 1, d, 0, 0, 0, 0) - KUWAIT_OFFSET_MIN * 60_000,
  );
  return { from, to: new Date(from.getTime() + DAY_MS), date: day };
}

function todayKuwaitDate() {
  const now = new Date();
  const local = new Date(now.getTime() + KUWAIT_OFFSET_MIN * 60_000);
  return local.toISOString().slice(0, 10);
}

function decimalToFixed4(value) {
  if (value == null) return '0.0000';
  if (typeof value === 'string') return new Prisma.Decimal(value).toFixed(4);
  if (value instanceof Prisma.Decimal) return value.toFixed(4);
  return new Prisma.Decimal(String(value)).toFixed(4);
}

function severityFor(amountKd) {
  const amount = Number.parseFloat(decimalToFixed4(amountKd));
  if (!Number.isFinite(amount)) return 'LOW';
  if (Math.abs(amount) >= 50) return 'HIGH';
  if (Math.abs(amount) > 0) return 'MEDIUM';
  return 'LOW';
}

function pickName(user) {
  if (!user) return null;
  return user.fullName || user.username || user.id || null;
}

function ensureRiskBucket(map, key, name, role) {
  if (!map.has(key)) {
    map.set(key, { id: key, name: name || key, role: role || 'UNKNOWN', riskScore: 0 });
  }
  const bucket = map.get(key);
  if (name && bucket.name === key) bucket.name = name;
  if (role && bucket.role === 'UNKNOWN') bucket.role = role;
  return bucket;
}

function severityRank(s) {
  if (s === 'HIGH') return 5;
  if (s === 'MEDIUM') return 3;
  return 1;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set; cannot run read-only audit.');
  }
  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const date = process.env.AUDIT_DATE || todayKuwaitDate();
    const range = parseKuwaitDay(date);

    const [orders, custodies, deposits, auditLogs, users, branches] = await Promise.all([
      prisma.order.findMany({
        where: {
          posPaymentMethod: 'CASH',
          OR: [
            { completedAt: { gte: range.from, lt: range.to } },
            { updatedAt: { gte: range.from, lt: range.to } },
          ],
        },
        select: {
          id: true,
          status: true,
          totalPrice: true,
          cashStatus: true,
          posPaymentMethod: true,
          driverId: true,
          handoverShiftId: true,
          completedAt: true,
          updatedAt: true,
          customerId: true,
        },
      }),
      prisma.managerCashCustody.findMany({
        where: { receivedFromDriverAt: { gte: range.from, lt: range.to } },
        select: {
          id: true,
          amountKd: true,
          driverId: true,
          managerId: true,
          branchId: true,
          shiftId: true,
          status: true,
          depositSlipUrl: true,
          receivedFromDriverAt: true,
          slipUploadedAt: true,
          verifiedAt: true,
        },
      }),
      prisma.bankDepositLog.findMany({
        where: { createdAt: { gte: range.from, lt: range.to } },
        select: {
          id: true,
          amountKd: true,
          status: true,
          shiftId: true,
          managerCashCustodyId: true,
          uploadedById: true,
          verifiedAt: true,
          createdAt: true,
        },
      }),
      prisma.auditLog.findMany({
        where: { timestamp: { gte: range.from, lt: range.to } },
        select: {
          id: true,
          action: true,
          source: true,
          amount: true,
          orderId: true,
          customerId: true,
          userId: true,
          changes: true,
          payload: true,
          timestamp: true,
        },
        take: 5000,
      }),
      prisma.user.findMany({
        select: {
          id: true,
          fullName: true,
          username: true,
          safariRole: true,
          branchId: true,
        },
      }),
      prisma.branch.findMany({ select: { id: true, name: true } }),
    ]);

    const usersById = new Map(users.map((u) => [u.id, u]));
    const branchesById = new Map(branches.map((b) => [b.id, b]));
    const accountants = users.filter((u) => u.safariRole === 'ACCOUNTANT');
    const accountantName = accountants.length > 0 ? pickName(accountants[0]) : null;

    const flows = [];
    const anomalies = [];
    const riskMap = new Map();

    const ordersByShift = new Map();
    for (const order of orders) {
      if (!order.handoverShiftId) continue;
      const list = ordersByShift.get(order.handoverShiftId) ?? [];
      list.push(order);
      ordersByShift.set(order.handoverShiftId, list);
    }

    const depositsByShift = new Map();
    const depositsByCustody = new Map();
    for (const deposit of deposits) {
      if (deposit.shiftId) {
        const list = depositsByShift.get(deposit.shiftId) ?? [];
        list.push(deposit);
        depositsByShift.set(deposit.shiftId, list);
      }
      if (deposit.managerCashCustodyId) {
        depositsByCustody.set(deposit.managerCashCustodyId, deposit);
      }
    }

    const custodyShiftIds = new Set(
      custodies.map((c) => c.shiftId).filter((id) => Boolean(id)),
    );

    let totalFlows = 0;
    let validFlows = 0;
    let issues = 0;

    for (const custody of custodies) {
      totalFlows += 1;
      const linkedOrders = custody.shiftId
        ? ordersByShift.get(custody.shiftId) ?? []
        : [];
      const ordersTotalMinor = linkedOrders.reduce(
        (sum, o) => sum + Math.round(Number(new Prisma.Decimal(o.totalPrice).times(10000))),
        0,
      );
      const custodyMinor = Math.round(Number(new Prisma.Decimal(custody.amountKd).times(10000)));
      const deposit =
        depositsByCustody.get(custody.id) ??
        (custody.shiftId ? (depositsByShift.get(custody.shiftId) ?? [])[0] ?? null : null);
      const depositMinor = deposit
        ? Math.round(Number(new Prisma.Decimal(deposit.amountKd).times(10000)))
        : null;
      const driver = custody.driverId ? usersById.get(custody.driverId) : null;
      const manager = custody.managerId ? usersById.get(custody.managerId) : null;
      const branch = custody.branchId ? branchesById.get(custody.branchId) : null;
      const flowAnomalies = [];

      const ordersTotalKd = (ordersTotalMinor / 10000).toFixed(4);
      const custodyAmountKd = decimalToFixed4(custody.amountKd);
      const depositAmountKd = deposit ? decimalToFixed4(deposit.amountKd) : null;

      if (linkedOrders.length === 0) {
        flowAnomalies.push('ORPHAN_CUSTODY');
      } else if (ordersTotalMinor !== custodyMinor) {
        flowAnomalies.push('CUSTODY_AMOUNT_MISMATCH');
      }

      if (
        custody.status === 'VERIFIED' &&
        custody.depositSlipUrl &&
        !deposit
      ) {
        flowAnomalies.push('DEPOSIT_NOT_REGISTERED');
      }
      if (deposit && depositMinor !== null && custodyMinor !== depositMinor) {
        flowAnomalies.push('DEPOSIT_AMOUNT_MISMATCH');
      }

      const flow = {
        custodyId: custody.id,
        shiftId: custody.shiftId,
        branch: branch ? { id: branch.id, name: branch.name } : null,
        driver: driver ? { id: driver.id, name: pickName(driver) } : null,
        branchManager: manager ? { id: manager.id, name: pickName(manager) } : null,
        ordersCount: linkedOrders.length,
        ordersTotalKd,
        custodyAmountKd,
        depositAmountKd,
        depositId: deposit?.id ?? null,
        custodyStatus: custody.status,
        depositStatus: deposit ? deposit.status : 'MISSING',
        anomalyFlags: flowAnomalies,
      };
      flows.push(flow);

      if (flowAnomalies.length === 0) {
        validFlows += 1;
      } else {
        issues += 1;
      }

      for (const flag of flowAnomalies) {
        const baseEvidence = {
          orderIds: linkedOrders.map((o) => o.id),
          handoverShiftId: custody.shiftId,
          custodyId: custody.id,
          depositId: deposit?.id ?? null,
          timestamps: {
            receivedFromDriverAt: custody.receivedFromDriverAt?.toISOString() ?? null,
            slipUploadedAt: custody.slipUploadedAt?.toISOString() ?? null,
            custodyVerifiedAt: custody.verifiedAt?.toISOString() ?? null,
            depositCreatedAt: deposit?.createdAt?.toISOString() ?? null,
            depositVerifiedAt: deposit?.verifiedAt?.toISOString() ?? null,
          },
        };
        let amount;
        let responsibleName;
        let responsibleRole;
        let confidence;
        let reason;
        let severity;
        let missingStep;

        if (flag === 'CUSTODY_AMOUNT_MISMATCH') {
          const diffMinor = ordersTotalMinor - custodyMinor;
          amount = (Math.abs(diffMinor) / 10000).toFixed(4);
          responsibleName = pickName(manager) ?? 'BRANCH_MANAGER';
          responsibleRole = 'BRANCH_MANAGER';
          confidence = 'MEDIUM';
          severity = severityFor(amount);
          reason = `Custody amount differs from sum of linked orders by ${amount} KD.`;
          missingStep = 'CUSTODY_VERIFICATION';
        } else if (flag === 'ORPHAN_CUSTODY') {
          amount = custodyAmountKd;
          responsibleName = 'SYSTEM';
          responsibleRole = 'SYSTEM';
          confidence = 'LOW';
          severity = severityFor(amount);
          reason = 'Custody bag exists with no linked CASH orders for the same shift.';
          missingStep = 'ORDER_LINK';
        } else if (flag === 'DEPOSIT_NOT_REGISTERED') {
          amount = custodyAmountKd;
          responsibleName = accountantName ?? 'ACCOUNTANT';
          responsibleRole = 'ACCOUNTANT';
          confidence = 'HIGH';
          severity = severityFor(amount);
          reason = 'Verified custody has a deposit slip but no BankDepositLog row.';
          missingStep = 'BANK_DEPOSIT_CREATION';
        } else if (flag === 'DEPOSIT_AMOUNT_MISMATCH') {
          const diffMinor = custodyMinor - (depositMinor ?? 0);
          amount = (Math.abs(diffMinor) / 10000).toFixed(4);
          responsibleName = accountantName ?? 'ACCOUNTANT';
          responsibleRole = 'ACCOUNTANT';
          confidence = 'MEDIUM';
          severity = severityFor(amount);
          reason = `Bank deposit amount differs from custody by ${amount} KD.`;
          missingStep = 'DEPOSIT_VERIFICATION';
        } else {
          amount = custodyAmountKd;
          responsibleName = 'SYSTEM';
          responsibleRole = 'SYSTEM';
          confidence = 'LOW';
          severity = 'LOW';
          reason = `Unclassified flow anomaly: ${flag}.`;
          missingStep = null;
        }

        anomalies.push({
          type: flag,
          amount,
          responsibleName,
          responsibleRole,
          confidence,
          severity,
          reason,
          missingStep,
          evidence: baseEvidence,
        });

        const bucket = ensureRiskBucket(
          riskMap,
          responsibleName,
          responsibleName,
          responsibleRole,
        );
        bucket.riskScore += severityRank(severity);
      }
    }

    const driverUnhandled = new Map();
    for (const order of orders) {
      if (
        order.cashStatus === 'PAID_TO_DRIVER' &&
        !order.handoverShiftId &&
        order.status === 'COMPLETED'
      ) {
        const key = order.driverId ?? 'UNKNOWN_DRIVER';
        const list = driverUnhandled.get(key) ?? { driverId: key, orders: [], totalMinor: 0 };
        list.orders.push(order.id);
        list.totalMinor += Math.round(Number(new Prisma.Decimal(order.totalPrice).times(10000)));
        driverUnhandled.set(key, list);
      }
    }
    for (const entry of driverUnhandled.values()) {
      const driver = entry.driverId === 'UNKNOWN_DRIVER' ? null : usersById.get(entry.driverId);
      const amountKd = (entry.totalMinor / 10000).toFixed(4);
      const severity = severityFor(amountKd);
      const responsibleName = pickName(driver) ?? 'DRIVER';
      anomalies.push({
        type: 'DRIVER_UNHANDLED_CASH',
        amount: amountKd,
        responsibleName,
        responsibleRole: 'DRIVER',
        confidence: 'HIGH',
        severity,
        reason: `Driver still holds ${entry.orders.length} cash order(s) totalling ${amountKd} KD without handover.`,
        missingStep: 'DRIVER_HANDOVER',
        evidence: {
          orderIds: entry.orders,
          handoverShiftId: null,
          custodyId: null,
          depositId: null,
          timestamps: {},
        },
      });
      const bucket = ensureRiskBucket(riskMap, responsibleName, responsibleName, 'DRIVER');
      bucket.riskScore += severityRank(severity);
    }

    const handoverWithoutCustody = new Map();
    for (const order of orders) {
      if (
        order.cashStatus === 'HANDED_OVER_TO_OFFICE' &&
        order.handoverShiftId &&
        !custodyShiftIds.has(order.handoverShiftId)
      ) {
        const key = order.handoverShiftId;
        const list = handoverWithoutCustody.get(key) ?? {
          shiftId: key,
          driverId: order.driverId ?? null,
          orders: [],
          totalMinor: 0,
        };
        list.orders.push(order.id);
        list.totalMinor += Math.round(Number(new Prisma.Decimal(order.totalPrice).times(10000)));
        handoverWithoutCustody.set(key, list);
      }
    }
    for (const entry of handoverWithoutCustody.values()) {
      const driver = entry.driverId ? usersById.get(entry.driverId) : null;
      const branchId = driver?.branchId ?? null;
      const branchManager = branchId
        ? users.find((u) => u.safariRole === 'MANAGER' && u.branchId === branchId)
        : null;
      const amountKd = (entry.totalMinor / 10000).toFixed(4);
      const severity = severityFor(amountKd);
      const responsibleName = pickName(branchManager) ?? 'BRANCH_MANAGER';
      anomalies.push({
        type: 'HANDOVER_NOT_RECEIVED',
        amount: amountKd,
        responsibleName,
        responsibleRole: 'BRANCH_MANAGER',
        confidence: 'MEDIUM',
        severity,
        reason: `Driver handover for shift ${entry.shiftId} has no matching ManagerCashCustody row.`,
        missingStep: 'BRANCH_CUSTODY_RECEIPT',
        evidence: {
          orderIds: entry.orders,
          handoverShiftId: entry.shiftId,
          custodyId: null,
          depositId: null,
          timestamps: {},
        },
      });
      const bucket = ensureRiskBucket(riskMap, responsibleName, responsibleName, 'BRANCH_MANAGER');
      bucket.riskScore += severityRank(severity);
    }

    let doubleCountCount = 0;
    let overpaymentCount = 0;
    let subscriptionLeak = 0;
    for (const entry of auditLogs) {
      if (entry.action === 'DOUBLE_COUNT_DETECTED') doubleCountCount += 1;
      if (entry.action === 'OVERPAYMENT_DETECTED') overpaymentCount += 1;
      if (entry.action === 'SUBSCRIPTION_SOURCE_ANOMALY') subscriptionLeak += 1;
    }
    if (doubleCountCount > 0) {
      anomalies.push({
        type: 'DOUBLE_COUNT_RISK',
        amount: '0.0000',
        responsibleName: 'SYSTEM',
        responsibleRole: 'SYSTEM',
        confidence: 'LOW',
        severity: 'LOW',
        reason: `${doubleCountCount} ledger PAYMENT row(s) linked to already-paid orders detected today (ignored by core).`,
        missingStep: null,
        evidence: { orderIds: [], handoverShiftId: null, custodyId: null, depositId: null, timestamps: {} },
      });
    }
    if (overpaymentCount > 0) {
      anomalies.push({
        type: 'OVERPAYMENT_ANOMALY',
        amount: '0.0000',
        responsibleName: 'SYSTEM',
        responsibleRole: 'SYSTEM',
        confidence: 'LOW',
        severity: 'LOW',
        reason: `${overpaymentCount} customer(s) flagged with overpayment today (totals not modified).`,
        missingStep: null,
        evidence: { orderIds: [], handoverShiftId: null, custodyId: null, depositId: null, timestamps: {} },
      });
    }
    if (subscriptionLeak > 0) {
      anomalies.push({
        type: 'SUBSCRIPTION_LEAKAGE',
        amount: '0.0000',
        responsibleName: 'SYSTEM',
        responsibleRole: 'SYSTEM',
        confidence: 'LOW',
        severity: 'LOW',
        reason: `${subscriptionLeak} subscription anomaly row(s) flagged today.`,
        missingStep: null,
        evidence: { orderIds: [], handoverShiftId: null, custodyId: null, depositId: null, timestamps: {} },
      });
    }

    const expectedEvents = [
      'ORDER_COMPLETED',
      'PAYMENT_RECEIVED',
      'DRIVER_HANDOVER',
      'BRANCH_CUSTODY_RECEIVED',
      'CUSTODY_VERIFIED',
      'BANK_DEPOSIT_CREATED',
    ];
    const observedActions = new Set(auditLogs.map((row) => row.action));
    const aliasMap = {
      ORDER_CREATED: 'ORDER_COMPLETED',
      ORDER_COMPLETED: 'ORDER_COMPLETED',
      PAYMENT_MADE: 'PAYMENT_RECEIVED',
      PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
      DEBT_PAYMENT: 'PAYMENT_RECEIVED',
      CASH_HANDOVER_CREATED: 'DRIVER_HANDOVER',
      DRIVER_HANDOVER: 'DRIVER_HANDOVER',
      MANAGER_CASH_CUSTODY_CREATED: 'BRANCH_CUSTODY_RECEIVED',
      BRANCH_CUSTODY_RECEIVED: 'BRANCH_CUSTODY_RECEIVED',
      MANAGER_CASH_CUSTODY_VERIFIED: 'CUSTODY_VERIFIED',
      CUSTODY_VERIFIED: 'CUSTODY_VERIFIED',
      CASH_DEPOSIT_REGISTERED: 'BANK_DEPOSIT_CREATED',
      BANK_DEPOSIT_CREATED: 'BANK_DEPOSIT_CREATED',
    };
    const observedCanonical = new Set();
    for (const action of observedActions) {
      observedCanonical.add(aliasMap[action] || action);
    }
    const hadFinancialActivity =
      orders.length > 0 || custodies.length > 0 || deposits.length > 0;
    const auditGaps = hadFinancialActivity
      ? expectedEvents.filter((e) => !observedCanonical.has(e))
      : [];

    const topRisks = [...riskMap.values()]
      .filter((r) => r.riskScore > 0)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10)
      .map((r) => ({ name: r.name, role: r.role, riskScore: r.riskScore }));

    const alertableTypes = new Set([
      'DEPOSIT_NOT_REGISTERED',
      'DRIVER_UNHANDLED_CASH',
      'HANDOVER_NOT_RECEIVED',
      'DEPOSIT_AMOUNT_MISMATCH',
      'CUSTODY_AMOUNT_MISMATCH',
    ]);
    const alerts = anomalies
      .filter((a) => alertableTypes.has(a.type))
      .map((a) => ({
        type: a.type,
        severity: a.severity,
        responsibleName: a.responsibleName,
        amount: a.amount,
        reason: a.reason,
      }));

    let systemHealth = 'OK';
    const hasHigh = anomalies.some((a) => a.severity === 'HIGH');
    if (hasHigh) systemHealth = 'CRITICAL';
    else if (anomalies.length > 0) systemHealth = 'WARNING';

    let finalAssessment;
    if (!hadFinancialActivity) {
      finalAssessment = `No CASH financial activity recorded for ${range.date}; nothing to reconcile.`;
    } else if (systemHealth === 'OK') {
      finalAssessment = `All ${totalFlows} cash flow(s) for ${range.date} reconcile end-to-end.`;
    } else {
      finalAssessment = `${issues} of ${totalFlows} cash flow(s) need follow-up; ${auditGaps.length} canonical audit event(s) missing.`;
    }

    const report = {
      systemHealth,
      summary: {
        date: range.date,
        totalFlows,
        validFlows,
        issues,
        ordersInspected: orders.length,
        custodiesInspected: custodies.length,
        depositsInspected: deposits.length,
        auditLogsInspected: auditLogs.length,
      },
      flows,
      anomalies,
      topRisks,
      alerts,
      auditGaps,
      finalAssessment,
    };

    process.stdout.write(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  process.stderr.write(`forensic_audit_failed: ${error.message}\n`);
  process.exit(1);
});
