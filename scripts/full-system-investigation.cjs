/* eslint-disable */
// READ-ONLY full system investigation — financial + operational layers.
// No writes. No mutations. Outputs a single strict JSON object on stdout
// matching the shape requested by the senior fintech auditor prompt.

'use strict';

const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env'), quiet: true });

const KUWAIT_OFFSET_MIN = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseKuwaitDay(input) {
  const day = String(input).slice(0, 10);
  const [y, m, d] = day.split('-').map(Number);
  const fromUtcMs =
    Date.UTC(y, m - 1, d, 0, 0, 0, 0) - KUWAIT_OFFSET_MIN * 60_000;
  return { from: new Date(fromUtcMs), to: new Date(fromUtcMs + DAY_MS), date: day };
}
function todayKuwait() {
  const local = new Date(Date.now() + KUWAIT_OFFSET_MIN * 60_000);
  return local.toISOString().slice(0, 10);
}
function dec(v) {
  if (v == null) return new Prisma.Decimal(0);
  if (v instanceof Prisma.Decimal) return v;
  return new Prisma.Decimal(String(v));
}
function dec4(v) {
  return dec(v).toFixed(4);
}
function minor(v) {
  return Math.round(Number(dec(v).times(10000)));
}
function severityFor(amountKd) {
  const a = Math.abs(Number(dec4(amountKd)));
  if (!Number.isFinite(a)) return 'LOW';
  if (a >= 50) return 'HIGH';
  if (a > 0) return 'MEDIUM';
  return 'LOW';
}
function severityRank(s) {
  return s === 'HIGH' ? 5 : s === 'MEDIUM' ? 3 : 1;
}
function pickName(u) {
  if (!u) return null;
  return u.fullName || u.username || u.id || null;
}
function ensureRiskBucket(map, name, role) {
  const key = `${role}::${name}`;
  if (!map.has(key)) {
    map.set(key, { name, role, riskScore: 0, issueCount: 0 });
  }
  return map.get(key);
}
function bumpRisk(map, name, role, severity) {
  const bucket = ensureRiskBucket(map, name || 'UNKNOWN', role || 'UNKNOWN');
  bucket.riskScore += severityRank(severity);
  bucket.issueCount += 1;
  return bucket;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const date = process.env.AUDIT_DATE || todayKuwait();
    const range = parseKuwaitDay(date);

    // ── STEP 1: FETCH DATA ───────────────────────────────────────────────
    const [
      orders,
      shifts,
      custodies,
      bankDeposits,
      debtEntries,
      txHistory,
      subscriptions,
      auditLogs,
      invoiceAuditLogs,
      debtTransfers,
      users,
      branches,
    ] = await Promise.all([
      prisma.order.findMany({
        where: {
          OR: [
            { createdAt: { gte: range.from, lt: range.to } },
            { updatedAt: { gte: range.from, lt: range.to } },
            { completedAt: { gte: range.from, lt: range.to } },
          ],
        },
        select: {
          id: true,
          status: true,
          serviceType: true,
          totalPrice: true,
          cashStatus: true,
          posPaymentMethod: true,
          driverId: true,
          customerId: true,
          handoverShiftId: true,
          subscriptionId: true,
          posPaymentBundleId: true,
          completedAt: true,
          walletSettledAt: true,
          createdAt: true,
          updatedAt: true,
          serialNumber: true,
          invoiceNumber: true,
        },
        take: 10000,
      }),
      prisma.shift.findMany({
        where: {
          OR: [
            { startedAt: { gte: range.from, lt: range.to } },
            { endedAt: { gte: range.from, lt: range.to } },
            { confirmedAt: { gte: range.from, lt: range.to } },
          ],
        },
        // Lifecycle-event timestamps only; ignore `updatedAt` to avoid false positives
        // from batch housekeeping cron jobs that bump updatedAt without business meaning.
        select: {
          id: true,
          driverId: true,
          status: true,
          startedAt: true,
          endedAt: true,
          declaredHandoverTotal: true,
          systemHandoverTotal: true,
          ordersSettledCount: true,
          bankDepositReceiptUrl: true,
          confirmedByManagerId: true,
          confirmedAt: true,
        },
      }),
      prisma.managerCashCustody.findMany({
        where: {
          // Lifecycle events only — exclude `createdAt` (often == receivedFromDriverAt)
          // and `updatedAt` (touched by housekeeping crons).
          OR: [
            { receivedFromDriverAt: { gte: range.from, lt: range.to } },
            { slipUploadedAt: { gte: range.from, lt: range.to } },
            { verifiedAt: { gte: range.from, lt: range.to } },
            { rejectedAt: { gte: range.from, lt: range.to } },
          ],
        },
        select: {
          id: true,
          managerId: true,
          driverId: true,
          branchId: true,
          shiftId: true,
          amountKd: true,
          settledOrderCount: true,
          status: true,
          receivedFromDriverAt: true,
          slipUploadedAt: true,
          depositSlipUrl: true,
          verifiedByAccountantId: true,
          verifiedAt: true,
          rejectedByAccountantId: true,
          rejectedAt: true,
          rejectionReason: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.bankDepositLog.findMany({
        where: {
          // Lifecycle only — drop `updatedAt` (batch housekeeping bumps it without
          // any business event, producing false-positive DEPOSIT_EVENT gaps).
          OR: [
            { createdAt: { gte: range.from, lt: range.to } },
            { verifiedAt: { gte: range.from, lt: range.to } },
          ],
        },
        select: {
          id: true,
          depositType: true,
          status: true,
          amountKd: true,
          shiftId: true,
          managerCashCustodyId: true,
          uploadedById: true,
          verifiedByAccountantId: true,
          verifiedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.debtLedgerEntry.findMany({
        where: { createdAt: { gte: range.from, lt: range.to } },
        select: {
          id: true,
          customerId: true,
          orderId: true,
          source: true,
          category: true,
          amount: true,
          branchId: true,
          actorUserId: true,
          refEntryId: true,
          sourceRef: true,
          createdAt: true,
          note: true,
        },
        take: 10000,
      }),
      prisma.transactionHistory.findMany({
        where: { createdAt: { gte: range.from, lt: range.to } },
        select: {
          id: true,
          type: true,
          customerId: true,
          orderId: true,
          subscriptionId: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          debtBefore: true,
          debtAfter: true,
          performedById: true,
          createdAt: true,
        },
        take: 10000,
      }),
      prisma.customerSubscription.findMany({
        where: {
          // Lifecycle events only.
          OR: [
            { activatedAt: { gte: range.from, lt: range.to } },
            { closedAt: { gte: range.from, lt: range.to } },
          ],
        },
        select: {
          id: true,
          customerId: true,
          planId: true,
          status: true,
          planNameSnapshot: true,
          planActualBalanceSnapshot: true,
          carriedBalanceKd: true,
          activatedAt: true,
          expiresAt: true,
          closedAt: true,
          closedReason: true,
        },
      }),
      prisma.auditLog.findMany({
        where: { timestamp: { gte: range.from, lt: range.to } },
        select: {
          id: true,
          userId: true,
          actorId: true,
          action: true,
          resource: true,
          status: true,
          orderId: true,
          customerId: true,
          amount: true,
          source: true,
          role: true,
          ip: true,
          suspicious: true,
          timestamp: true,
        },
        take: 20000,
      }),
      prisma.invoiceAuditLog.findMany({
        where: { createdAt: { gte: range.from, lt: range.to } },
        select: {
          id: true,
          orderId: true,
          action: true,
          actorId: true,
          actorRole: true,
          actorName: true,
          financialImpactFils: true,
          createdAt: true,
        },
      }),
      prisma.debtTransfer.findMany({
        where: {
          OR: [
            { createdAt: { gte: range.from, lt: range.to } },
            { finalizedAt: { gte: range.from, lt: range.to } },
            { cancelledAt: { gte: range.from, lt: range.to } },
          ],
        },
        select: {
          id: true,
          sourceDriverId: true,
          targetDriverId: true,
          totalAmount: true,
          orderCount: true,
          status: true,
          executedById: true,
          finalizedAt: true,
          cancelledAt: true,
          createdAt: true,
        },
      }),
      prisma.user.findMany({
        select: {
          id: true,
          fullName: true,
          username: true,
          safariRole: true,
          branchId: true,
          isActive: true,
        },
      }),
      prisma.branch.findMany({ select: { id: true, name: true } }),
    ]);

    const usersById = new Map(users.map((u) => [u.id, u]));
    const branchesById = new Map(branches.map((b) => [b.id, b]));
    const ordersById = new Map(orders.map((o) => [o.id, o]));
    const shiftsById = new Map(shifts.map((s) => [s.id, s]));
    const custodiesById = new Map(custodies.map((c) => [c.id, c]));

    const accountants = users.filter((u) => u.safariRole === 'ACCOUNTANT' && u.isActive !== false);
    const accountantName =
      accountants.length > 0 ? pickName(accountants[0]) : 'ACCOUNTANT';
    const generalManagers = users.filter(
      (u) => u.safariRole === 'GENERAL_MANAGER' && u.isActive !== false,
    );

    const branchManagerOf = (branchId) => {
      if (!branchId) return null;
      return (
        users.find(
          (u) =>
            u.safariRole === 'MANAGER' &&
            u.branchId === branchId &&
            u.isActive !== false,
        ) || null
      );
    };

    // ── STEP 2: ORDER LIFECYCLE ──────────────────────────────────────────
    const operationalIssues = [];
    const financialIssues = [];
    const crossIssues = [];
    const alerts = [];
    const riskMap = new Map();
    const lifecycleSummary = {
      total: orders.length,
      byStatus: {},
      byPaymentMethod: {},
      byCashStatus: {},
    };
    for (const o of orders) {
      lifecycleSummary.byStatus[o.status] = (lifecycleSummary.byStatus[o.status] || 0) + 1;
      lifecycleSummary.byPaymentMethod[o.posPaymentMethod] =
        (lifecycleSummary.byPaymentMethod[o.posPaymentMethod] || 0) + 1;
      lifecycleSummary.byCashStatus[o.cashStatus] =
        (lifecycleSummary.byCashStatus[o.cashStatus] || 0) + 1;
    }

    const completedStatuses = new Set(['COMPLETED']);
    const finalisedStatuses = new Set(['COMPLETED', 'CANCELED']);

    // Operational: completed without driver
    for (const o of orders) {
      if (completedStatuses.has(o.status) && !o.driverId && o.posPaymentMethod !== 'KNET') {
        // KNET counter sales legitimately have no driver
        const sev = severityFor(o.totalPrice);
        const customer = null;
        const responsibleName = 'BRANCH_MANAGER';
        operationalIssues.push({
          type: 'ORDER_COMPLETED_WITHOUT_DRIVER',
          orderId: o.id,
          serialNumber: o.serialNumber,
          amount: dec4(o.totalPrice),
          status: o.status,
          posPaymentMethod: o.posPaymentMethod,
          responsibleName,
          responsibleRole: 'BRANCH_MANAGER',
          confidence: 'MEDIUM',
          severity: sev,
          reason:
            'Order reached COMPLETED but no driverId is assigned; non-KNET orders must be attributed to a driver.',
          missingStep: 'DRIVER_ASSIGNMENT',
        });
        bumpRisk(riskMap, responsibleName, 'BRANCH_MANAGER', sev);
      }
      // Operational: completed orders with no completedAt timestamp (status drift)
      if (completedStatuses.has(o.status) && !o.completedAt) {
        operationalIssues.push({
          type: 'TASK_FLOW_BROKEN',
          orderId: o.id,
          serialNumber: o.serialNumber,
          amount: dec4(o.totalPrice),
          status: o.status,
          posPaymentMethod: o.posPaymentMethod,
          responsibleName: 'SYSTEM',
          responsibleRole: 'SYSTEM',
          confidence: 'HIGH',
          severity: 'MEDIUM',
          reason:
            'Order is marked COMPLETED but completedAt timestamp is null — lifecycle invariant broken.',
          missingStep: 'COMPLETION_STAMP',
        });
        bumpRisk(riskMap, 'SYSTEM', 'SYSTEM', 'MEDIUM');
      }
    }

    // ── STEP 3: FINANCIAL VALIDATION (per order) ─────────────────────────
    // Negative totals
    for (const o of orders) {
      if (dec(o.totalPrice).lt(0)) {
        const sev = severityFor(o.totalPrice);
        financialIssues.push({
          type: 'NEGATIVE_ORDER_TOTAL',
          orderId: o.id,
          serialNumber: o.serialNumber,
          amount: dec4(o.totalPrice),
          responsibleName: 'SYSTEM',
          responsibleRole: 'SYSTEM',
          confidence: 'HIGH',
          severity: sev,
          reason: 'Order total is negative — invariant violated.',
          missingStep: 'PRICE_VALIDATION',
        });
        bumpRisk(riskMap, 'SYSTEM', 'SYSTEM', sev);
      }
    }

    // Multiple sources for same order → look at debt PAYMENT entries vs posPaymentMethod
    // Build map orderId → debtPaymentCount, debtCreationCount
    const debtCreationByOrder = new Map();
    const debtPaymentByOrder = new Map();
    for (const e of debtEntries) {
      if (!e.orderId) continue;
      if (e.source === 'PAYMENT') {
        debtPaymentByOrder.set(e.orderId, (debtPaymentByOrder.get(e.orderId) || 0) + 1);
      } else {
        debtCreationByOrder.set(e.orderId, (debtCreationByOrder.get(e.orderId) || 0) + 1);
      }
    }

    // Wallet (subscription) settlements per order
    const walletSettlementByOrder = new Map();
    for (const t of txHistory) {
      if (!t.orderId) continue;
      if (t.type === 'ORDER_WALLET_SETTLEMENT') {
        walletSettlementByOrder.set(
          t.orderId,
          (walletSettlementByOrder.get(t.orderId) || 0) + 1,
        );
      }
    }

    // Detect double-count risk: order has BOTH wallet settlement and a non-wallet posPaymentMethod with debt creation, etc.
    for (const o of orders) {
      const walletCount = walletSettlementByOrder.get(o.id) || 0;
      const debtPay = debtPaymentByOrder.get(o.id) || 0;
      const debtCreate = debtCreationByOrder.get(o.id) || 0;

      if (walletCount > 1) {
        const sev = severityFor(o.totalPrice);
        financialIssues.push({
          type: 'DOUBLE_COUNT_RISK',
          orderId: o.id,
          serialNumber: o.serialNumber,
          amount: dec4(o.totalPrice),
          responsibleName: 'SYSTEM',
          responsibleRole: 'SYSTEM',
          confidence: 'HIGH',
          severity: sev,
          reason: `Order has ${walletCount} ORDER_WALLET_SETTLEMENT rows — wallet was charged more than once.`,
          missingStep: 'IDEMPOTENCY_CHECK',
        });
        bumpRisk(riskMap, 'SYSTEM', 'SYSTEM', sev);
      }
      if (debtPay > 0 && debtCreate > 0) {
        const sev = severityFor(o.totalPrice);
        financialIssues.push({
          type: 'DOUBLE_COUNT_RISK',
          orderId: o.id,
          serialNumber: o.serialNumber,
          amount: dec4(o.totalPrice),
          responsibleName: 'SYSTEM',
          responsibleRole: 'SYSTEM',
          confidence: 'MEDIUM',
          severity: sev,
          reason:
            'Order has both debt creation and debt payment rows on the same Kuwait day; verify settlement order.',
          missingStep: 'LEDGER_REVIEW',
        });
        bumpRisk(riskMap, 'SYSTEM', 'SYSTEM', sev);
      }
      // Order completed without payment recognition:
      // posPaymentMethod=CASH but cashStatus=UNPAID and status=COMPLETED → cross issue
      if (
        completedStatuses.has(o.status) &&
        o.posPaymentMethod === 'CASH' &&
        o.cashStatus === 'UNPAID'
      ) {
        const sev = severityFor(o.totalPrice);
        const driver = o.driverId ? usersById.get(o.driverId) : null;
        const responsibleName = pickName(driver) || 'DRIVER';
        crossIssues.push({
          type: 'ORDER_COMPLETED_BUT_NO_CASH',
          orderId: o.id,
          serialNumber: o.serialNumber,
          amount: dec4(o.totalPrice),
          responsibleName,
          responsibleRole: 'DRIVER',
          confidence: 'MEDIUM',
          severity: sev,
          reason: 'CASH order is COMPLETED but cashStatus=UNPAID — driver did not record collection.',
          missingStep: 'DRIVER_CASH_COLLECTION',
        });
        bumpRisk(riskMap, responsibleName, 'DRIVER', sev);
      }
      // Subscription order without subscriptionId
      if (o.posPaymentMethod === 'SUBSCRIPTION_WALLET' && !o.subscriptionId) {
        const sev = severityFor(o.totalPrice);
        financialIssues.push({
          type: 'SUBSCRIPTION_LEAKAGE',
          orderId: o.id,
          serialNumber: o.serialNumber,
          amount: dec4(o.totalPrice),
          responsibleName: 'SYSTEM',
          responsibleRole: 'SYSTEM',
          confidence: 'MEDIUM',
          severity: sev,
          reason:
            'Order paid via SUBSCRIPTION_WALLET but has no subscriptionId — wallet attribution lost.',
          missingStep: 'SUBSCRIPTION_LINK',
        });
        bumpRisk(riskMap, 'SYSTEM', 'SYSTEM', sev);
      }
      // Wallet settled but never marked completed
      if (o.walletSettledAt && o.status !== 'COMPLETED') {
        operationalIssues.push({
          type: 'TASK_FLOW_BROKEN',
          orderId: o.id,
          serialNumber: o.serialNumber,
          amount: dec4(o.totalPrice),
          status: o.status,
          posPaymentMethod: o.posPaymentMethod,
          responsibleName: 'SYSTEM',
          responsibleRole: 'SYSTEM',
          confidence: 'MEDIUM',
          severity: 'LOW',
          reason: 'walletSettledAt is set but order status is not COMPLETED — sequence broken.',
          missingStep: 'STATUS_TRANSITION',
        });
        bumpRisk(riskMap, 'SYSTEM', 'SYSTEM', 'LOW');
      }
    }

    // Negative debt amounts
    for (const e of debtEntries) {
      if (dec(e.amount).lt(0)) {
        const actor = e.actorUserId ? usersById.get(e.actorUserId) : null;
        const responsibleName = pickName(actor) || 'SYSTEM';
        const role = actor?.safariRole || 'SYSTEM';
        const sev = severityFor(e.amount);
        financialIssues.push({
          type: 'NEGATIVE_DEBT_ENTRY',
          orderId: e.orderId,
          customerId: e.customerId,
          source: e.source,
          amount: dec4(e.amount),
          responsibleName,
          responsibleRole: role,
          confidence: 'HIGH',
          severity: sev,
          reason:
            'DebtLedgerEntry.amount is negative — invariant violated (amount must be positive; sign is implied by source).',
          missingStep: 'LEDGER_VALIDATION',
        });
        bumpRisk(riskMap, responsibleName, role, sev);
      }
    }

    // Subscription overuse / leakage detection — check TransactionHistory wallet settlements
    // where balanceAfter < 0 by more than carriedBalance (potential leakage)
    for (const t of txHistory) {
      if (t.type === 'ORDER_WALLET_SETTLEMENT' && dec(t.balanceAfter).lt(0)) {
        // Negative wallet without matching SUBSCRIPTION_OVERUSE debt entry → leakage
        const matchingDebt = debtEntries.find(
          (e) =>
            e.orderId === t.orderId &&
            e.source === 'SUBSCRIPTION_OVERUSE',
        );
        if (!matchingDebt) {
          const performer = t.performedById ? usersById.get(t.performedById) : null;
          const sev = severityFor(t.balanceAfter);
          const responsibleName = pickName(performer) || 'SYSTEM';
          financialIssues.push({
            type: 'SUBSCRIPTION_LEAKAGE',
            orderId: t.orderId,
            customerId: t.customerId,
            amount: dec4(dec(t.balanceAfter).abs()),
            responsibleName,
            responsibleRole: performer?.safariRole || 'SYSTEM',
            confidence: 'MEDIUM',
            severity: sev,
            reason:
              'Wallet went negative on settlement but no SUBSCRIPTION_OVERUSE debt entry was created.',
            missingStep: 'SUBSCRIPTION_OVERUSE_BOOKING',
          });
          bumpRisk(riskMap, responsibleName, performer?.safariRole || 'SYSTEM', sev);
        }
      }
    }

    // ── STEP 4 + 5: CASH FLOW + CROSS VALIDATION ─────────────────────────
    // Build maps keyed by shift.
    const cashOrdersByShift = new Map();
    const cashOrdersByDriver = new Map();
    for (const o of orders) {
      if (o.posPaymentMethod !== 'CASH') continue;
      if (o.handoverShiftId) {
        const arr = cashOrdersByShift.get(o.handoverShiftId) || [];
        arr.push(o);
        cashOrdersByShift.set(o.handoverShiftId, arr);
      }
      if (o.driverId) {
        const arr = cashOrdersByDriver.get(o.driverId) || [];
        arr.push(o);
        cashOrdersByDriver.set(o.driverId, arr);
      }
    }

    const depositsByCustody = new Map();
    const depositsByShift = new Map();
    for (const d of bankDeposits) {
      if (d.managerCashCustodyId) depositsByCustody.set(d.managerCashCustodyId, d);
      if (d.shiftId) {
        const arr = depositsByShift.get(d.shiftId) || [];
        arr.push(d);
        depositsByShift.set(d.shiftId, arr);
      }
    }
    const custodyShiftIds = new Set(
      custodies.map((c) => c.shiftId).filter(Boolean),
    );

    const flows = [];
    let validFlows = 0;
    let totalFlows = 0;

    for (const custody of custodies) {
      totalFlows += 1;
      const linkedOrders = custody.shiftId
        ? cashOrdersByShift.get(custody.shiftId) || []
        : [];
      const ordersTotalMinor = linkedOrders.reduce((s, o) => s + minor(o.totalPrice), 0);
      const custodyMinor = minor(custody.amountKd);
      const deposit =
        depositsByCustody.get(custody.id) ||
        (custody.shiftId ? (depositsByShift.get(custody.shiftId) || [])[0] : null) ||
        null;
      const depositMinorVal = deposit ? minor(deposit.amountKd) : null;

      const driver = custody.driverId ? usersById.get(custody.driverId) : null;
      const manager = custody.managerId ? usersById.get(custody.managerId) : null;
      const branch = custody.branchId ? branchesById.get(custody.branchId) : null;
      const flags = [];

      if (linkedOrders.length === 0) flags.push('ORPHAN_CUSTODY');
      else if (ordersTotalMinor !== custodyMinor) flags.push('CUSTODY_AMOUNT_MISMATCH');

      if (custody.status === 'VERIFIED' && custody.depositSlipUrl && !deposit) {
        flags.push('DEPOSIT_NOT_REGISTERED');
      }
      if (deposit && depositMinorVal !== null && custodyMinor !== depositMinorVal) {
        flags.push('DEPOSIT_AMOUNT_MISMATCH');
      }

      const flow = {
        custodyId: custody.id,
        shiftId: custody.shiftId,
        branch: branch ? { id: branch.id, name: branch.name } : null,
        driver: driver ? { id: driver.id, name: pickName(driver) } : null,
        branchManager: manager ? { id: manager.id, name: pickName(manager) } : null,
        ordersCount: linkedOrders.length,
        ordersTotalKd: (ordersTotalMinor / 10000).toFixed(4),
        custodyAmountKd: dec4(custody.amountKd),
        depositAmountKd: deposit ? dec4(deposit.amountKd) : null,
        depositId: deposit?.id ?? null,
        custodyStatus: custody.status,
        depositStatus: deposit ? deposit.status : 'MISSING',
        anomalyFlags: flags,
      };
      flows.push(flow);
      if (flags.length === 0) validFlows += 1;

      for (const flag of flags) {
        let amount, responsibleName, responsibleRole, confidence, severity, reason, missingStep;
        if (flag === 'ORPHAN_CUSTODY') {
          amount = dec4(custody.amountKd);
          responsibleName = pickName(manager) || 'BRANCH_MANAGER';
          responsibleRole = 'BRANCH_MANAGER';
          confidence = 'LOW';
          severity = severityFor(amount);
          reason = 'Custody bag has no linked CASH orders for the same shift.';
          missingStep = 'ORDER_LINK';
        } else if (flag === 'CUSTODY_AMOUNT_MISMATCH') {
          const diffMinor = ordersTotalMinor - custodyMinor;
          amount = (Math.abs(diffMinor) / 10000).toFixed(4);
          responsibleName = pickName(manager) || 'BRANCH_MANAGER';
          responsibleRole = 'BRANCH_MANAGER';
          confidence = 'MEDIUM';
          severity = severityFor(amount);
          reason = `Custody amount differs from linked CASH orders by ${amount} KD.`;
          missingStep = 'CUSTODY_VERIFICATION';
        } else if (flag === 'DEPOSIT_NOT_REGISTERED') {
          amount = dec4(custody.amountKd);
          responsibleName = accountantName;
          responsibleRole = 'ACCOUNTANT';
          confidence = 'HIGH';
          severity = severityFor(amount);
          reason = 'Verified custody has a deposit slip but no BankDepositLog row.';
          missingStep = 'BANK_DEPOSIT_CREATION';
        } else if (flag === 'DEPOSIT_AMOUNT_MISMATCH') {
          const diffMinor = custodyMinor - (depositMinorVal ?? 0);
          amount = (Math.abs(diffMinor) / 10000).toFixed(4);
          responsibleName = accountantName;
          responsibleRole = 'ACCOUNTANT';
          confidence = 'MEDIUM';
          severity = severityFor(amount);
          reason = `Bank deposit amount differs from custody by ${amount} KD.`;
          missingStep = 'DEPOSIT_VERIFICATION';
        } else {
          amount = dec4(custody.amountKd);
          responsibleName = 'SYSTEM';
          responsibleRole = 'SYSTEM';
          confidence = 'LOW';
          severity = 'LOW';
          reason = `Unclassified flow anomaly: ${flag}`;
          missingStep = null;
        }
        crossIssues.push({
          type: flag,
          custodyId: custody.id,
          shiftId: custody.shiftId,
          orderIds: linkedOrders.map((o) => o.id),
          depositId: deposit?.id ?? null,
          amount,
          responsibleName,
          responsibleRole,
          confidence,
          severity,
          reason,
          missingStep,
        });
        bumpRisk(riskMap, responsibleName, responsibleRole, severity);
      }
    }

    // Driver still holding cash without handover (HIGH severity)
    const driverUnhandled = new Map();
    for (const o of orders) {
      if (
        o.cashStatus === 'PAID_TO_DRIVER' &&
        !o.handoverShiftId &&
        o.status === 'COMPLETED'
      ) {
        const key = o.driverId || 'UNKNOWN_DRIVER';
        const cur = driverUnhandled.get(key) || { driverId: key, orders: [], totalMinor: 0 };
        cur.orders.push(o.id);
        cur.totalMinor += minor(o.totalPrice);
        driverUnhandled.set(key, cur);
      }
    }
    for (const entry of driverUnhandled.values()) {
      const driver = entry.driverId === 'UNKNOWN_DRIVER' ? null : usersById.get(entry.driverId);
      const amountKd = (entry.totalMinor / 10000).toFixed(4);
      const sev = severityFor(amountKd);
      const responsibleName = pickName(driver) || 'DRIVER';
      crossIssues.push({
        type: 'DRIVER_UNHANDLED_CASH',
        driverId: entry.driverId,
        orderIds: entry.orders,
        amount: amountKd,
        responsibleName,
        responsibleRole: 'DRIVER',
        confidence: 'HIGH',
        severity: sev,
        reason: `Driver still holds ${entry.orders.length} cash order(s) totalling ${amountKd} KD without handover.`,
        missingStep: 'DRIVER_HANDOVER',
      });
      bumpRisk(riskMap, responsibleName, 'DRIVER', sev);
    }

    // Handover orders without matching custody bag
    const handoverWithoutCustody = new Map();
    for (const o of orders) {
      if (
        o.cashStatus === 'HANDED_OVER_TO_OFFICE' &&
        o.handoverShiftId &&
        !custodyShiftIds.has(o.handoverShiftId)
      ) {
        const key = o.handoverShiftId;
        const cur = handoverWithoutCustody.get(key) || {
          shiftId: key,
          driverId: o.driverId || null,
          orders: [],
          totalMinor: 0,
        };
        cur.orders.push(o.id);
        cur.totalMinor += minor(o.totalPrice);
        handoverWithoutCustody.set(key, cur);
      }
    }
    for (const entry of handoverWithoutCustody.values()) {
      const driver = entry.driverId ? usersById.get(entry.driverId) : null;
      const branchId = driver?.branchId ?? null;
      const branchManager = branchManagerOf(branchId);
      const amountKd = (entry.totalMinor / 10000).toFixed(4);
      const sev = severityFor(amountKd);
      const responsibleName = pickName(branchManager) || 'BRANCH_MANAGER';
      crossIssues.push({
        type: 'HANDOVER_WITHOUT_ORDERS',
        shiftId: entry.shiftId,
        orderIds: entry.orders,
        amount: amountKd,
        responsibleName,
        responsibleRole: 'BRANCH_MANAGER',
        confidence: 'MEDIUM',
        severity: sev,
        reason: `Driver handover shift ${entry.shiftId} has no matching ManagerCashCustody row — branch did not record receipt.`,
        missingStep: 'BRANCH_CUSTODY_RECEIPT',
      });
      bumpRisk(riskMap, responsibleName, 'BRANCH_MANAGER', sev);
    }

    // Cash collected but no order: handover total in shift exceeds linked orders
    for (const s of shifts) {
      if (s.systemHandoverTotal && dec(s.systemHandoverTotal).gt(0)) {
        const linkedOrders = cashOrdersByShift.get(s.id) || [];
        const linkedTotalMinor = linkedOrders.reduce((sum, o) => sum + minor(o.totalPrice), 0);
        const handoverMinor = minor(s.systemHandoverTotal);
        if (handoverMinor > linkedTotalMinor && linkedOrders.length === 0) {
          const driver = s.driverId ? usersById.get(s.driverId) : null;
          const responsibleName = pickName(driver) || 'DRIVER';
          const amount = ((handoverMinor - linkedTotalMinor) / 10000).toFixed(4);
          const sev = severityFor(amount);
          crossIssues.push({
            type: 'CASH_COLLECTED_BUT_NO_ORDER',
            shiftId: s.id,
            amount,
            responsibleName,
            responsibleRole: 'DRIVER',
            confidence: 'MEDIUM',
            severity: sev,
            reason: `Shift handover total ${dec4(s.systemHandoverTotal)} KD has no linked CASH orders.`,
            missingStep: 'ORDER_RECONCILIATION',
          });
          bumpRisk(riskMap, responsibleName, 'DRIVER', sev);
        }
      }
    }

    // Shifts: closed shift with handover total but no custody bag
    for (const s of shifts) {
      if (
        s.status === 'CLOSED' &&
        s.systemHandoverTotal &&
        dec(s.systemHandoverTotal).gt(0) &&
        !custodies.some((c) => c.shiftId === s.id)
      ) {
        const driver = s.driverId ? usersById.get(s.driverId) : null;
        const branchManager = branchManagerOf(driver?.branchId ?? null);
        const responsibleName = pickName(branchManager) || 'BRANCH_MANAGER';
        const sev = severityFor(s.systemHandoverTotal);
        crossIssues.push({
          type: 'HANDOVER_WITHOUT_ORDERS',
          shiftId: s.id,
          driverId: s.driverId,
          amount: dec4(s.systemHandoverTotal),
          responsibleName,
          responsibleRole: 'BRANCH_MANAGER',
          confidence: 'MEDIUM',
          severity: sev,
          reason: `Closed shift declared ${dec4(s.systemHandoverTotal)} KD handover but ManagerCashCustody bag was never created.`,
          missingStep: 'BRANCH_CUSTODY_RECEIPT',
        });
        bumpRisk(riskMap, responsibleName, 'BRANCH_MANAGER', sev);
      }
    }

    // ── STEP 6: Additional anomalies from existing infrastructure ─────────
    // Suspicious audit logs
    const suspiciousAudit = auditLogs.filter((a) => a.suspicious === true);
    if (suspiciousAudit.length > 0) {
      const grouped = new Map();
      for (const a of suspiciousAudit) {
        const u = a.userId ? usersById.get(a.userId) : null;
        const key = u ? u.id : 'UNKNOWN';
        const cur = grouped.get(key) || { user: u, count: 0, actions: new Set() };
        cur.count += 1;
        cur.actions.add(a.action);
        grouped.set(key, cur);
      }
      for (const g of grouped.values()) {
        const responsibleName = pickName(g.user) || 'UNKNOWN_USER';
        const role = g.user?.safariRole || 'UNKNOWN';
        const sev = g.count >= 5 ? 'HIGH' : g.count >= 2 ? 'MEDIUM' : 'LOW';
        operationalIssues.push({
          type: 'SUSPICIOUS_AUDIT_ACTIVITY',
          actor: responsibleName,
          actorRole: role,
          count: g.count,
          actions: [...g.actions],
          responsibleName,
          responsibleRole: role,
          confidence: 'MEDIUM',
          severity: sev,
          reason: `${g.count} audit log row(s) for this actor were flagged suspicious today.`,
          missingStep: 'SECURITY_REVIEW',
        });
        bumpRisk(riskMap, responsibleName, role, sev);
      }
    }

    // Denied audit attempts
    const deniedAudit = auditLogs.filter((a) => a.status === 'DENIED');
    if (deniedAudit.length > 0) {
      const groupedByActor = new Map();
      for (const a of deniedAudit) {
        const u = a.userId ? usersById.get(a.userId) : null;
        const key = u ? u.id : a.ip || 'UNKNOWN';
        const cur = groupedByActor.get(key) || { user: u, ip: a.ip, count: 0 };
        cur.count += 1;
        groupedByActor.set(key, cur);
      }
      for (const g of groupedByActor.values()) {
        if (g.count < 3) continue;
        const responsibleName = pickName(g.user) || g.ip || 'UNKNOWN_ACTOR';
        const role = g.user?.safariRole || 'UNKNOWN';
        const sev = g.count >= 20 ? 'HIGH' : g.count >= 10 ? 'MEDIUM' : 'LOW';
        operationalIssues.push({
          type: 'REPEATED_PERMISSION_DENIED',
          actor: responsibleName,
          actorRole: role,
          count: g.count,
          responsibleName,
          responsibleRole: role,
          confidence: 'MEDIUM',
          severity: sev,
          reason: `${g.count} permission-denied audit row(s) for this actor today.`,
          missingStep: 'ROLE_REVIEW',
        });
        bumpRisk(riskMap, responsibleName, role, sev);
      }
    }

    // Invoice edits / voids by Call-Center Supervisor — visibility (not always an issue)
    if (invoiceAuditLogs.length > 0) {
      const voids = invoiceAuditLogs.filter((r) => r.action === 'VOID');
      const edits = invoiceAuditLogs.filter((r) => r.action === 'EDIT');
      if (voids.length > 0) {
        const totalImpact = voids.reduce(
          (sum, v) => sum + Number(v.financialImpactFils || 0),
          0,
        );
        const amount = (Math.abs(totalImpact) / 1000).toFixed(4); // fils → KD (1 KD = 1000 fils)
        const sev = severityFor(amount);
        const top = voids[0];
        const actorName = top.actorName || 'CALL_CENTER_SUPERVISOR';
        operationalIssues.push({
          type: 'INVOICE_VOIDS_TODAY',
          count: voids.length,
          totalFinancialImpactKd: amount,
          responsibleName: actorName,
          responsibleRole: top.actorRole || 'CALL_CENTER_SUPERVISOR',
          confidence: 'HIGH',
          severity: sev,
          reason: `${voids.length} same-day invoice VOID(s) recorded; cumulative GL impact ${amount} KD.`,
          missingStep: 'SUPERVISOR_REVIEW',
        });
        bumpRisk(riskMap, actorName, top.actorRole || 'CALL_CENTER_SUPERVISOR', sev);
      }
      if (edits.length > 0) {
        const totalImpact = edits.reduce(
          (sum, v) => sum + Number(v.financialImpactFils || 0),
          0,
        );
        const amount = (Math.abs(totalImpact) / 1000).toFixed(4);
        const sev = Math.abs(totalImpact) === 0 ? 'LOW' : severityFor(amount);
        const top = edits[0];
        const actorName = top.actorName || 'CALL_CENTER_SUPERVISOR';
        operationalIssues.push({
          type: 'INVOICE_EDITS_TODAY',
          count: edits.length,
          totalFinancialImpactKd: amount,
          responsibleName: actorName,
          responsibleRole: top.actorRole || 'CALL_CENTER_SUPERVISOR',
          confidence: 'HIGH',
          severity: sev,
          reason: `${edits.length} same-day invoice EDIT(s) recorded; cumulative GL impact ${amount} KD.`,
          missingStep: 'SUPERVISOR_REVIEW',
        });
        if (sev !== 'LOW') {
          bumpRisk(riskMap, actorName, top.actorRole || 'CALL_CENTER_SUPERVISOR', sev);
        }
      }
    }

    // ── STEP 10: AUDIT VALIDATION ────────────────────────────────────────
    const observedActions = new Set(auditLogs.map((r) => r.action));
    const aliasMap = {
      ORDER_CREATED: 'ORDER_EVENT',
      ORDER_COMPLETED: 'ORDER_EVENT',
      ORDER_UPDATED: 'ORDER_EVENT',
      POS_CHECKOUT: 'ORDER_EVENT',
      PAYMENT_MADE: 'PAYMENT_EVENT',
      PAYMENT_RECEIVED: 'PAYMENT_EVENT',
      DEBT_PAYMENT: 'PAYMENT_EVENT',
      PAYMENT_FINALIZE: 'PAYMENT_EVENT',
      CASH_HANDOVER_CREATED: 'CASH_EVENT',
      DRIVER_HANDOVER: 'CASH_EVENT',
      MANAGER_CASH_CUSTODY_CREATED: 'CASH_EVENT',
      MANAGER_CASH_CUSTODY_VERIFIED: 'CASH_EVENT',
      CASH_DEPOSIT_REGISTERED: 'DEPOSIT_EVENT',
      BANK_DEPOSIT_CREATED: 'DEPOSIT_EVENT',
      BANK_DEPOSIT_VERIFIED: 'DEPOSIT_EVENT',
    };
    const observedCanonical = new Set();
    for (const a of observedActions) {
      const canon = aliasMap[a];
      if (canon) observedCanonical.add(canon);
    }
    const expectedActivity = {
      ORDER_EVENT: orders.length > 0,
      PAYMENT_EVENT:
        orders.length > 0 || debtEntries.length > 0 || txHistory.length > 0,
      CASH_EVENT: custodies.length > 0,
      DEPOSIT_EVENT: bankDeposits.length > 0,
    };
    const auditGaps = Object.entries(expectedActivity)
      .filter(([eventClass, expected]) => expected && !observedCanonical.has(eventClass))
      .map(([eventClass]) => eventClass);
    const hadFinancialActivity =
      orders.length > 0 ||
      custodies.length > 0 ||
      bankDeposits.length > 0 ||
      debtEntries.length > 0 ||
      txHistory.length > 0;

    // ── STEP 8: RISK + STEP 9: ALERTS ────────────────────────────────────
    const topRisks = [...riskMap.values()]
      .filter((r) => r.riskScore > 0)
      .sort((a, b) => b.riskScore - a.riskScore || b.issueCount - a.issueCount)
      .slice(0, 10)
      .map((r) => ({
        name: r.name,
        role: r.role,
        riskScore: r.riskScore,
        issueCount: r.issueCount,
      }));

    const alertableTypes = new Set([
      'DEPOSIT_NOT_REGISTERED',
      'CUSTODY_AMOUNT_MISMATCH',
      'DEPOSIT_AMOUNT_MISMATCH',
      'DRIVER_UNHANDLED_CASH',
      'HANDOVER_WITHOUT_ORDERS',
      'ORDER_COMPLETED_BUT_NO_CASH',
      'CASH_COLLECTED_BUT_NO_ORDER',
      'DOUBLE_COUNT_RISK',
      'NEGATIVE_ORDER_TOTAL',
      'NEGATIVE_DEBT_ENTRY',
      'SUBSCRIPTION_LEAKAGE',
      'ORDER_COMPLETED_WITHOUT_DRIVER',
      'TASK_FLOW_BROKEN',
      'SUSPICIOUS_AUDIT_ACTIVITY',
      'REPEATED_PERMISSION_DENIED',
      'INVOICE_VOIDS_TODAY',
    ]);
    const allIssues = [...financialIssues, ...operationalIssues, ...crossIssues];
    for (const i of allIssues) {
      if (alertableTypes.has(i.type) && i.severity !== 'LOW') {
        alerts.push({
          type: i.type,
          severity: i.severity,
          responsibleName: i.responsibleName,
          responsibleRole: i.responsibleRole,
          amount: i.amount ?? '0.0000',
          reason: i.reason,
        });
      }
    }

    // ── HEALTH SUMMARY ───────────────────────────────────────────────────
    const hasHighFin = financialIssues.some((i) => i.severity === 'HIGH');
    const hasMedFin = financialIssues.some((i) => i.severity === 'MEDIUM');
    const hasHighOps = operationalIssues.some((i) => i.severity === 'HIGH');
    const hasMedOps = operationalIssues.some((i) => i.severity === 'MEDIUM');
    const hasHighCross = crossIssues.some((i) => i.severity === 'HIGH');
    const hasMedCross = crossIssues.some((i) => i.severity === 'MEDIUM');

    const financialHealth = hasHighFin || hasHighCross
      ? 'CRITICAL'
      : hasMedFin || hasMedCross || financialIssues.length > 0 || crossIssues.length > 0
      ? 'WARNING'
      : 'OK';
    const operationalHealth = hasHighOps
      ? 'CRITICAL'
      : hasMedOps || operationalIssues.length > 0
      ? 'WARNING'
      : 'OK';
    const systemHealth =
      financialHealth === 'CRITICAL' || operationalHealth === 'CRITICAL'
        ? 'CRITICAL'
        : financialHealth === 'WARNING' || operationalHealth === 'WARNING'
        ? 'WARNING'
        : 'OK';

    let finalAssessment;
    if (!hadFinancialActivity && shifts.length === 0) {
      finalAssessment = `No financial or operational activity recorded for ${range.date}; nothing to reconcile.`;
    } else if (!hadFinancialActivity && shifts.length > 0) {
      finalAssessment = `${shifts.length} driver shift(s) opened on ${range.date} but no orders, payments, custodies or deposits were recorded — operational day started, no money flow yet.`;
    } else if (systemHealth === 'OK') {
      finalAssessment = `${orders.length} order(s) on ${range.date} reconcile end-to-end across order → payment → custody → deposit chain.`;
    } else {
      finalAssessment = `${allIssues.length} issue(s) detected for ${range.date} across financial (${financialIssues.length}), operational (${operationalIssues.length}), cross-layer (${crossIssues.length}). ${auditGaps.length} canonical audit event class(es) missing. Top responsibility: ${topRisks[0]?.name ?? 'n/a'} (${topRisks[0]?.role ?? 'n/a'}).`;
    }

    const report = {
      systemHealth,
      financialHealth,
      operationalHealth,
      summary: {
        date: range.date,
        scope: 'ALL_BRANCHES',
        ordersInspected: orders.length,
        shiftsInspected: shifts.length,
        custodiesInspected: custodies.length,
        bankDepositsInspected: bankDeposits.length,
        debtEntriesInspected: debtEntries.length,
        transactionHistoryInspected: txHistory.length,
        subscriptionsInspected: subscriptions.length,
        debtTransfersInspected: debtTransfers.length,
        invoiceAuditLogsInspected: invoiceAuditLogs.length,
        auditLogsInspected: auditLogs.length,
        usersKnown: users.length,
        branchesKnown: branches.length,
        ordersByStatus: lifecycleSummary.byStatus,
        ordersByPaymentMethod: lifecycleSummary.byPaymentMethod,
        ordersByCashStatus: lifecycleSummary.byCashStatus,
        cashFlowsTotal: totalFlows,
        cashFlowsValid: validFlows,
        cashFlowsWithIssues: totalFlows - validFlows,
      },
      financialIssues,
      operationalIssues,
      crossIssues,
      cashFlows: flows,
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

main().catch((err) => {
  process.stderr.write(`full_system_investigation_failed: ${err.message}\n${err.stack || ''}\n`);
  process.exit(1);
});
