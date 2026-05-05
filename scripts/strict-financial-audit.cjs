/* eslint-disable */
/*
 * Strict, validation-gated financial investigation.
 *
 * READ-ONLY. Performs a Kuwait-day audit of the Order → Payment →
 * Driver Collection → Driver Handover → Branch Custody → Custody
 * Verification → Bank Deposit chain across ALL branches.
 *
 * The defining property of this script vs. `full-system-investigation.cjs`
 * is the VALIDATION GATE: every driver and every flow is classified
 * BEFORE any anomaly logic runs:
 *
 *   NO_ACTIVITY_TODAY    → no orders + no cash collected today
 *   HISTORICAL_BALANCE   → driver still holds cash, but the most
 *                          recent cash activity is older than today
 *   ACTIVE_FLOW          → at least one order or one cash movement today
 *
 * Only ACTIVE_FLOW items are eligible for anomaly classification.
 * Inactive drivers and historical balances are reported under
 * `ignoredCases` with `ignoredNonOperational = true` and never
 * generate alerts, risk scores, or responsibility assignments.
 *
 * Run:  node scripts/strict-financial-audit.cjs
 * Date: AUDIT_DATE=YYYY-MM-DD (Kuwait local) — defaults to today.
 *
 * STRICT: no writes, no mutations, no side effects.
 */
'use strict';

const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

require('dotenv').config({
  path: require('path').resolve(__dirname, '..', '.env'),
  quiet: true,
});

/* ─── Kuwait-day window helpers ──────────────────────────────────── */

const KUWAIT_OFFSET_MIN = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseKuwaitDay(input) {
  const day = String(input).slice(0, 10);
  const [y, m, d] = day.split('-').map(Number);
  const fromUtcMs =
    Date.UTC(y, m - 1, d, 0, 0, 0, 0) - KUWAIT_OFFSET_MIN * 60_000;
  return {
    from: new Date(fromUtcMs),
    to: new Date(fromUtcMs + DAY_MS),
    date: day,
  };
}
function todayKuwait() {
  const local = new Date(Date.now() + KUWAIT_OFFSET_MIN * 60_000);
  return local.toISOString().slice(0, 10);
}
function kuwaitDayOf(dt) {
  if (!dt) return null;
  const t = dt instanceof Date ? dt.getTime() : new Date(dt).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + KUWAIT_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

/* ─── Money helpers (no math beyond minor-units conversion) ──────── */

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
function pickName(u) {
  if (!u) return null;
  return u.fullName || u.username || u.id || null;
}
function severityFor(amountKd) {
  const a = Math.abs(Number(dec4(amountKd)));
  if (!Number.isFinite(a)) return 'LOW';
  if (a >= 50) return 'HIGH';
  if (a > 0) return 'MEDIUM';
  return 'LOW';
}

/* ─── main ───────────────────────────────────────────────────────── */

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const date = process.env.AUDIT_DATE || todayKuwait();
    const range = parseKuwaitDay(date);

    /* ── STEP 1: FETCH DATA (cash chain only) ──────────────────── */

    const [
      todayCashOrders,
      heldCashOrders,
      mostRecentHandoverPerDriver,
      shifts,
      custodiesAll,
      bankDeposits,
      auditLogs,
      users,
      branches,
    ] = await Promise.all([
      // CASH orders that touched today (created OR completed today)
      prisma.order.findMany({
        where: {
          posPaymentMethod: 'CASH',
          OR: [
            { createdAt: { gte: range.from, lt: range.to } },
            { completedAt: { gte: range.from, lt: range.to } },
          ],
        },
        select: {
          id: true,
          driverId: true,
          status: true,
          cashStatus: true,
          totalPrice: true,
          handoverShiftId: true,
          completedAt: true,
          createdAt: true,
          serialNumber: true,
        },
        take: 20000,
      }),
      // ALL CASH orders the drivers still hold (any date) — used to
      // compute `remainingCash` and `lastCashActivityDate` regardless
      // of when the cash was collected.
      prisma.order.findMany({
        where: {
          posPaymentMethod: 'CASH',
          cashStatus: 'PAID_TO_DRIVER',
          status: 'COMPLETED',
          handoverShiftId: null,
        },
        select: {
          id: true,
          driverId: true,
          totalPrice: true,
          completedAt: true,
        },
        take: 20000,
      }),
      // Most-recent handover (any date) per driver — second source for
      // `lastCashActivityDate`. We prefer this over `updatedAt` to
      // avoid false positives from batch crons.
      prisma.shift.findMany({
        where: {
          status: 'CLOSED',
          systemHandoverTotal: { gt: 0 },
        },
        select: {
          id: true,
          driverId: true,
          confirmedAt: true,
          endedAt: true,
          systemHandoverTotal: true,
        },
      }),
      // Today's shifts (lifecycle events only — no `updatedAt`)
      prisma.shift.findMany({
        where: {
          OR: [
            { startedAt: { gte: range.from, lt: range.to } },
            { endedAt: { gte: range.from, lt: range.to } },
            { confirmedAt: { gte: range.from, lt: range.to } },
          ],
        },
        select: {
          id: true,
          driverId: true,
          status: true,
          startedAt: true,
          endedAt: true,
          confirmedAt: true,
          declaredHandoverTotal: true,
          systemHandoverTotal: true,
          ordersSettledCount: true,
          confirmedByManagerId: true,
        },
      }),
      // ALL non-final custodies (any date) — needed for both today's
      // flows AND for HISTORICAL_BALANCE detection of older custodies
      // that are still PENDING_DEPOSIT or AWAITING_VERIFICATION.
      prisma.managerCashCustody.findMany({
        where: {
          OR: [
            { status: { in: ['PENDING_DEPOSIT', 'AWAITING_VERIFICATION'] } },
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
          verifiedAt: true,
          rejectedAt: true,
        },
        take: 5000,
      }),
      // Bank deposits with any lifecycle event today, plus pending
      // deposits attached to non-final custodies.
      prisma.bankDepositLog.findMany({
        where: {
          OR: [
            { createdAt: { gte: range.from, lt: range.to } },
            { verifiedAt: { gte: range.from, lt: range.to } },
            { status: 'PENDING' },
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
        },
      }),
      // Today's audit logs — used ONLY to verify presence of canonical
      // event classes when ACTIVE_FLOW exists.
      prisma.auditLog.findMany({
        where: { timestamp: { gte: range.from, lt: range.to } },
        select: {
          id: true,
          userId: true,
          action: true,
          status: true,
          timestamp: true,
        },
        take: 20000,
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
    const driverUsers = users.filter((u) => u.safariRole === 'DRIVER');

    const accountants = users.filter(
      (u) => u.safariRole === 'ACCOUNTANT' && u.isActive !== false,
    );
    const accountantName =
      accountants.length > 0 ? pickName(accountants[0]) : 'ACCOUNTANT';
    const branchManagerByBranchId = new Map();
    for (const u of users) {
      if (
        u.safariRole === 'MANAGER' &&
        u.branchId &&
        u.isActive !== false &&
        !branchManagerByBranchId.has(u.branchId)
      ) {
        branchManagerByBranchId.set(u.branchId, u);
      }
    }

    /* ── STEP 0: VALIDATION GATE (per-driver context) ─────────── */

    const todayCashByDriver = new Map();
    for (const o of todayCashOrders) {
      if (!o.driverId) continue;
      const arr = todayCashByDriver.get(o.driverId) || [];
      arr.push(o);
      todayCashByDriver.set(o.driverId, arr);
    }
    const heldByDriver = new Map();
    for (const o of heldCashOrders) {
      if (!o.driverId) continue;
      const arr = heldByDriver.get(o.driverId) || [];
      arr.push(o);
      heldByDriver.set(o.driverId, arr);
    }
    const lastHandoverByDriver = new Map();
    for (const s of mostRecentHandoverPerDriver) {
      if (!s.driverId) continue;
      const stamp = s.confirmedAt || s.endedAt;
      if (!stamp) continue;
      const cur = lastHandoverByDriver.get(s.driverId);
      if (!cur || cur.getTime() < new Date(stamp).getTime()) {
        lastHandoverByDriver.set(s.driverId, new Date(stamp));
      }
    }

    /**
     * Build per-driver context exactly as the spec describes.
     *
     *   - ordersTodayCount    : CASH orders the driver completed/created today
     *   - collectedCashToday  : KD value of those orders
     *   - handedOverToday     : KD value handed over via shifts confirmed today
     *   - remainingCash       : KD still in driver's hand right now (any date)
     *   - lastCashActivityDate: max(last completed CASH order, last handover)
     */
    const driverContexts = []; // ordered list
    const driverContextById = new Map();

    const todayShiftsByDriver = new Map();
    for (const s of shifts) {
      if (!s.driverId) continue;
      const arr = todayShiftsByDriver.get(s.driverId) || [];
      arr.push(s);
      todayShiftsByDriver.set(s.driverId, arr);
    }

    // We classify EVERY driver who shows up anywhere (today or held).
    const candidateDriverIds = new Set([
      ...todayCashByDriver.keys(),
      ...heldByDriver.keys(),
      ...todayShiftsByDriver.keys(),
    ]);

    for (const driverId of candidateDriverIds) {
      const driver = usersById.get(driverId) || null;
      const todays = todayCashByDriver.get(driverId) || [];
      const held = heldByDriver.get(driverId) || [];
      const todayShifts = todayShiftsByDriver.get(driverId) || [];

      const ordersTodayCount = todays.length;
      const collectedTodayMinor = todays
        .filter((o) => o.cashStatus !== 'UNPAID')
        .reduce((s, o) => s + minor(o.totalPrice), 0);
      const handedOverTodayMinor = todayShifts
        .filter((s) => kuwaitDayOf(s.confirmedAt) === range.date)
        .reduce((s, sh) => s + minor(sh.systemHandoverTotal || 0), 0);
      const remainingMinor = held.reduce(
        (s, o) => s + minor(o.totalPrice),
        0,
      );

      // lastCashActivityDate = latest of (held order completedAt,
      // last confirmed handover). This catches "I haven't moved any
      // cash in a week" so HISTORICAL_BALANCE can fire.
      let lastActivity = null;
      for (const o of held) {
        if (o.completedAt) {
          if (!lastActivity || lastActivity < o.completedAt) {
            lastActivity = o.completedAt;
          }
        }
      }
      for (const o of todays) {
        const stamp = o.completedAt || o.createdAt;
        if (stamp && (!lastActivity || lastActivity < stamp)) {
          lastActivity = stamp;
        }
      }
      const handoverStamp = lastHandoverByDriver.get(driverId);
      if (handoverStamp && (!lastActivity || lastActivity < handoverStamp)) {
        lastActivity = handoverStamp;
      }

      const lastActivityDate = lastActivity ? kuwaitDayOf(lastActivity) : null;

      // CLASSIFY
      let context;
      if (ordersTodayCount === 0 && collectedTodayMinor === 0) {
        if (remainingMinor > 0 && lastActivityDate && lastActivityDate < range.date) {
          context = 'HISTORICAL_BALANCE';
        } else if (remainingMinor === 0) {
          context = 'NO_ACTIVITY_TODAY';
        } else {
          // remainingMinor > 0 with no historical date → treat as historical
          // (we lack the timestamp, but it's certainly not today's flow).
          context = 'HISTORICAL_BALANCE';
        }
      } else {
        context = 'ACTIVE_FLOW';
      }

      const ctx = {
        driverId,
        driverName: pickName(driver),
        branchId: driver?.branchId ?? null,
        ordersTodayCount,
        collectedCashToday: (collectedTodayMinor / 10000).toFixed(4),
        handedOverToday: (handedOverTodayMinor / 10000).toFixed(4),
        remainingCash: (remainingMinor / 10000).toFixed(4),
        lastCashActivityDate: lastActivityDate,
        context,
        ignoredNonOperational: context !== 'ACTIVE_FLOW',
      };
      driverContexts.push(ctx);
      driverContextById.set(driverId, ctx);
    }

    /* ── STEP 1.5: PRE-COMPUTE INDEXES FOR FLOW BUILD ─────────── */

    const cashOrdersByShift = new Map();
    for (const o of todayCashOrders) {
      if (!o.handoverShiftId) continue;
      const arr = cashOrdersByShift.get(o.handoverShiftId) || [];
      arr.push(o);
      cashOrdersByShift.set(o.handoverShiftId, arr);
    }

    const depositsByCustody = new Map();
    const depositsByShift = new Map();
    for (const d of bankDeposits) {
      if (d.managerCashCustodyId)
        depositsByCustody.set(d.managerCashCustodyId, d);
      if (d.shiftId) {
        const arr = depositsByShift.get(d.shiftId) || [];
        arr.push(d);
        depositsByShift.set(d.shiftId, arr);
      }
    }

    /* ── STEP 2: BUILD FLOW MAP (per custody) ──────────────────── */

    const flows = [];
    const ignoredCases = [];
    const anomalies = [];

    for (const custody of custodiesAll) {
      const receivedDay = kuwaitDayOf(custody.receivedFromDriverAt);
      const verifiedDay = kuwaitDayOf(custody.verifiedAt);
      const createdToday =
        receivedDay === range.date || verifiedDay === range.date;

      const linkedOrders = custody.shiftId
        ? cashOrdersByShift.get(custody.shiftId) || []
        : [];
      const ordersTotalMinor = linkedOrders.reduce(
        (s, o) => s + minor(o.totalPrice),
        0,
      );
      const custodyMinor = minor(custody.amountKd);
      const deposit =
        depositsByCustody.get(custody.id) ||
        (custody.shiftId
          ? (depositsByShift.get(custody.shiftId) || [])[0]
          : null) ||
        null;
      const depositMinorVal = deposit ? minor(deposit.amountKd) : null;

      // Status (flow-based, IGNORE timing differences):
      //   BALANCED : sum(orders) == custody == deposit (when present)
      //   PARTIAL  : custody recorded but deposit missing or not yet verified
      //   MISMATCH : amounts disagree at any join
      let status;
      if (linkedOrders.length === 0) {
        // We don't have today's CASH orders for this custody (older
        // custody, or shift not linked). If the custody is from today
        // we'll later flag ORPHAN_CUSTODY.
        status = 'PARTIAL';
      } else if (ordersTotalMinor !== custodyMinor) {
        status = 'MISMATCH';
      } else if (deposit && depositMinorVal !== custodyMinor) {
        status = 'MISMATCH';
      } else if (!deposit) {
        status = 'PARTIAL';
      } else {
        status = 'BALANCED';
      }

      const flowRow = {
        custodyId: custody.id,
        ordersTotal: (ordersTotalMinor / 10000).toFixed(4),
        custodyAmount: dec4(custody.amountKd),
        depositAmount: deposit ? dec4(deposit.amountKd) : null,
        status,
        ignoredNonOperational: !createdToday,
      };
      flows.push(flowRow);

      if (!createdToday) {
        // HISTORICAL_BALANCE flow — record under ignoredCases and skip.
        ignoredCases.push({
          type: 'HISTORICAL_BALANCE',
          driverId: custody.driverId,
          amount: dec4(custody.amountKd),
          note: `Custody ${custody.id} dates ${receivedDay ?? 'unknown'} (status=${custody.status}); not part of ${range.date} flow.`,
        });
        continue;
      }

      // ─── STEP 4: ANOMALY DETECTION (flow-level, ACTIVE only) ──

      const driverCtx = custody.driverId
        ? driverContextById.get(custody.driverId)
        : null;
      const manager = custody.managerId
        ? usersById.get(custody.managerId)
        : null;
      const branch = custody.branchId
        ? branchesById.get(custody.branchId)
        : null;

      // Manager mismatch / orders disagreeing with custody
      if (
        linkedOrders.length > 0 &&
        ordersTotalMinor !== custodyMinor
      ) {
        const diffMinor = Math.abs(ordersTotalMinor - custodyMinor);
        const amount = (diffMinor / 10000).toFixed(4);
        anomalies.push({
          type: 'CUSTODY_AMOUNT_MISMATCH',
          amount,
          custodyId: custody.id,
          reason: `Custody ${dec4(custody.amountKd)} KD differs from ${linkedOrders.length} linked CASH order(s) totalling ${(ordersTotalMinor / 10000).toFixed(4)} KD by ${amount} KD.`,
          responsible: pickName(manager) || 'BRANCH_MANAGER',
          responsibleRole: 'BRANCH_MANAGER',
          severity: severityFor(amount),
          branch: branch ? { id: branch.id, name: branch.name } : null,
        });
      }

      // Custody created today but no orders linked → ORPHAN_CUSTODY
      if (linkedOrders.length === 0 && custody.shiftId) {
        anomalies.push({
          type: 'ORPHAN_CUSTODY',
          amount: dec4(custody.amountKd),
          custodyId: custody.id,
          reason: `Custody created ${receivedDay} for shift ${custody.shiftId} has no linked CASH orders today.`,
          responsible: pickName(manager) || 'BRANCH_MANAGER',
          responsibleRole: 'BRANCH_MANAGER',
          severity: severityFor(custody.amountKd),
          branch: branch ? { id: branch.id, name: branch.name } : null,
        });
      }

      // Custody verified + slip uploaded but no deposit row → DEPOSIT_NOT_REGISTERED
      if (
        custody.status === 'VERIFIED' &&
        custody.depositSlipUrl &&
        !deposit
      ) {
        anomalies.push({
          type: 'DEPOSIT_NOT_REGISTERED',
          amount: dec4(custody.amountKd),
          custodyId: custody.id,
          reason: `Custody verified today with slip uploaded but no BankDepositLog row exists.`,
          responsible: accountantName,
          responsibleRole: 'ACCOUNTANT',
          severity: severityFor(custody.amountKd),
          branch: branch ? { id: branch.id, name: branch.name } : null,
        });
      }

      // Deposit amount disagrees with custody → DEPOSIT_AMOUNT_MISMATCH
      if (deposit && depositMinorVal !== null && custodyMinor !== depositMinorVal) {
        const diffMinor = Math.abs(custodyMinor - depositMinorVal);
        const amount = (diffMinor / 10000).toFixed(4);
        anomalies.push({
          type: 'DEPOSIT_AMOUNT_MISMATCH',
          amount,
          custodyId: custody.id,
          depositId: deposit.id,
          reason: `Bank deposit ${dec4(deposit.amountKd)} KD does not match custody ${dec4(custody.amountKd)} KD (diff ${amount} KD).`,
          responsible: accountantName,
          responsibleRole: 'ACCOUNTANT',
          severity: severityFor(amount),
          branch: branch ? { id: branch.id, name: branch.name } : null,
        });
      }

      // Custody created today + status PENDING_DEPOSIT/AWAITING_VERIFICATION
      // and no deposit yet → CUSTODY_WITHOUT_DEPOSIT (only after a
      // reasonable processing window — same-day after 18:00 Kuwait).
      if (
        !deposit &&
        ['PENDING_DEPOSIT', 'AWAITING_VERIFICATION'].includes(
          custody.status,
        ) &&
        custodyIsOverdueToday(custody.receivedFromDriverAt)
      ) {
        anomalies.push({
          type: 'CUSTODY_WITHOUT_DEPOSIT',
          amount: dec4(custody.amountKd),
          custodyId: custody.id,
          reason: `Custody received at ${custody.receivedFromDriverAt?.toISOString?.() ?? 'unknown'} is still ${custody.status} and not yet deposited.`,
          responsible: accountantName,
          responsibleRole: 'ACCOUNTANT',
          severity: severityFor(custody.amountKd),
          branch: branch ? { id: branch.id, name: branch.name } : null,
        });
      }

      // Driver of this custody must be ACTIVE_FLOW too
      if (driverCtx && driverCtx.context !== 'ACTIVE_FLOW') {
        // Surface as ignoredCases entry — useful audit trail
        ignoredCases.push({
          type: driverCtx.context,
          driverId: driverCtx.driverId,
          amount: driverCtx.remainingCash,
          note: `Driver ${driverCtx.driverName ?? driverCtx.driverId} classified ${driverCtx.context} but appears on a custody from ${receivedDay}.`,
        });
      }
    }

    /* ── STEP 2.5: ORPHAN FLOWS at the SHIFT/DRIVER level ─────── */

    // HANDOVER_NOT_RECEIVED — closed shift today with handover total
    // > 0 but no custody bag. ONLY for ACTIVE_FLOW drivers.
    const custodyShiftIds = new Set(
      custodiesAll.map((c) => c.shiftId).filter(Boolean),
    );
    for (const s of shifts) {
      if (s.status !== 'CLOSED') continue;
      if (!s.systemHandoverTotal || dec(s.systemHandoverTotal).lte(0)) continue;
      if (custodyShiftIds.has(s.id)) continue;
      const driverCtx = s.driverId
        ? driverContextById.get(s.driverId)
        : null;
      if (!driverCtx || driverCtx.context !== 'ACTIVE_FLOW') {
        if (driverCtx) {
          ignoredCases.push({
            type: driverCtx.context,
            driverId: driverCtx.driverId,
            amount: dec4(s.systemHandoverTotal),
            note: `Shift ${s.id} closed today with ${dec4(s.systemHandoverTotal)} KD handover, but driver context is ${driverCtx.context}.`,
          });
        }
        continue;
      }
      const driver = usersById.get(s.driverId);
      const branchManager = branchManagerByBranchId.get(driver?.branchId ?? '');
      const amount = dec4(s.systemHandoverTotal);
      anomalies.push({
        type: 'HANDOVER_WITHOUT_CUSTODY',
        amount,
        shiftId: s.id,
        custodyId: null,
        driverId: s.driverId,
        reason: `Shift ${s.id} closed today with ${amount} KD handover but no ManagerCashCustody bag was created.`,
        responsible: pickName(branchManager) || 'BRANCH_MANAGER',
        responsibleRole: 'BRANCH_MANAGER',
        severity: severityFor(amount),
      });
    }

    // DRIVER_UNHANDLED_CASH — driver completed CASH orders today but
    // has not yet handed them over via a closed shift. Only ACTIVE.
    const todayUnhandledByDriver = new Map();
    for (const o of todayCashOrders) {
      if (
        o.cashStatus !== 'PAID_TO_DRIVER' ||
        o.handoverShiftId ||
        o.status !== 'COMPLETED'
      )
        continue;
      const key = o.driverId || 'UNKNOWN_DRIVER';
      const cur = todayUnhandledByDriver.get(key) || {
        driverId: key,
        orders: [],
        totalMinor: 0,
      };
      cur.orders.push(o.id);
      cur.totalMinor += minor(o.totalPrice);
      todayUnhandledByDriver.set(key, cur);
    }
    for (const entry of todayUnhandledByDriver.values()) {
      const driverCtx =
        entry.driverId === 'UNKNOWN_DRIVER'
          ? null
          : driverContextById.get(entry.driverId);
      if (!driverCtx || driverCtx.context !== 'ACTIVE_FLOW') {
        if (driverCtx) {
          ignoredCases.push({
            type: driverCtx.context,
            driverId: entry.driverId,
            amount: (entry.totalMinor / 10000).toFixed(4),
            note: `Driver holds ${entry.orders.length} order(s) totalling ${(entry.totalMinor / 10000).toFixed(4)} KD but context is ${driverCtx.context}.`,
          });
        }
        continue;
      }
      const driver = usersById.get(entry.driverId) || null;
      const amount = (entry.totalMinor / 10000).toFixed(4);
      anomalies.push({
        type: 'DRIVER_UNHANDLED_CASH',
        amount,
        custodyId: null,
        driverId: entry.driverId,
        orderIds: entry.orders,
        reason: `Driver completed ${entry.orders.length} CASH order(s) today totalling ${amount} KD but has not handed cash over to the branch.`,
        responsible: pickName(driver) || 'DRIVER',
        responsibleRole: 'DRIVER',
        severity: severityFor(amount),
      });
    }

    // HISTORICAL_BALANCE drivers reported once each
    for (const ctx of driverContexts) {
      if (
        ctx.context === 'HISTORICAL_BALANCE' &&
        Number(ctx.remainingCash) > 0
      ) {
        // Avoid duplicating if already added under a custody/shift loop
        const dup = ignoredCases.find(
          (i) =>
            i.type === 'HISTORICAL_BALANCE' &&
            i.driverId === ctx.driverId &&
            i.amount === ctx.remainingCash,
        );
        if (!dup) {
          ignoredCases.push({
            type: 'HISTORICAL_BALANCE',
            driverId: ctx.driverId,
            amount: ctx.remainingCash,
            note: `Driver ${ctx.driverName ?? ctx.driverId} carries ${ctx.remainingCash} KD from prior days (last cash activity ${ctx.lastCashActivityDate ?? 'unknown'}); not today's risk.`,
          });
        }
      } else if (ctx.context === 'NO_ACTIVITY_TODAY') {
        // Only worth listing if the driver is on shift today, otherwise
        // it's just noise (we'd report every off-duty driver).
        const onShiftToday = shifts.some((s) => s.driverId === ctx.driverId);
        if (onShiftToday) {
          ignoredCases.push({
            type: 'NO_ACTIVITY_TODAY',
            driverId: ctx.driverId,
            amount: '0.0000',
            note: `Driver ${ctx.driverName ?? ctx.driverId} opened a shift today but recorded no cash orders.`,
          });
        }
      }
    }

    /* ── STEP 6: AUDIT VALIDATION (only if ACTIVE_FLOW exists) ─ */

    const hasActiveFlow = driverContexts.some(
      (c) => c.context === 'ACTIVE_FLOW',
    );
    let auditGaps = [];
    if (hasActiveFlow) {
      const observed = new Set(auditLogs.map((r) => r.action));
      const aliasMap = {
        ORDER_CREATED: 'ORDER_COMPLETED',
        ORDER_COMPLETED: 'ORDER_COMPLETED',
        POS_CHECKOUT: 'ORDER_COMPLETED',
        ORDER_UPDATED: 'ORDER_COMPLETED',
        PAYMENT_MADE: 'PAYMENT_RECEIVED',
        PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
        DEBT_PAYMENT: 'PAYMENT_RECEIVED',
        PAYMENT_FINALIZE: 'PAYMENT_RECEIVED',
        DRIVER_HANDOVER: 'DRIVER_HANDOVER',
        CASH_HANDOVER_CREATED: 'DRIVER_HANDOVER',
        MANAGER_CASH_CUSTODY_CREATED: 'BRANCH_CUSTODY_RECEIVED',
        MANAGER_CASH_CUSTODY_VERIFIED: 'CUSTODY_VERIFIED',
        BANK_DEPOSIT_CREATED: 'BANK_DEPOSIT_CREATED',
        CASH_DEPOSIT_REGISTERED: 'BANK_DEPOSIT_CREATED',
        BANK_DEPOSIT_VERIFIED: 'BANK_DEPOSIT_CREATED',
      };
      const observedCanonical = new Set();
      for (const a of observed) {
        const c = aliasMap[a];
        if (c) observedCanonical.add(c);
      }
      const todayHadOrders = todayCashOrders.length > 0;
      const todayHadCustody = custodiesAll.some(
        (c) => kuwaitDayOf(c.receivedFromDriverAt) === range.date,
      );
      const todayHadDeposit = bankDeposits.some(
        (d) => kuwaitDayOf(d.createdAt) === range.date,
      );
      const todayHadConfirmedShift = shifts.some(
        (s) => kuwaitDayOf(s.confirmedAt) === range.date,
      );
      const expected = {
        ORDER_COMPLETED: todayHadOrders,
        PAYMENT_RECEIVED: todayHadOrders,
        DRIVER_HANDOVER: todayHadConfirmedShift,
        BRANCH_CUSTODY_RECEIVED: todayHadCustody,
        CUSTODY_VERIFIED: custodiesAll.some(
          (c) => kuwaitDayOf(c.verifiedAt) === range.date,
        ),
        BANK_DEPOSIT_CREATED: todayHadDeposit,
      };
      auditGaps = Object.entries(expected)
        .filter(([k, v]) => v && !observedCanonical.has(k))
        .map(([k]) => k);
    }

    /* ── STEP 7: SUMMARIES + HEALTH ────────────────────────────── */

    const inactiveDrivers = driverContexts.filter(
      (c) => c.context === 'NO_ACTIVITY_TODAY',
    ).length;
    const historicalBalances = driverContexts.filter(
      (c) => c.context === 'HISTORICAL_BALANCE',
    ).length;
    const activeFlowsCount = driverContexts.filter(
      (c) => c.context === 'ACTIVE_FLOW',
    ).length;

    const totalFlows = flows.length;
    const validFlows = flows.filter(
      (f) => f.status === 'BALANCED' && !f.ignoredNonOperational,
    ).length;
    const issuesCount = anomalies.length;

    const hasHigh = anomalies.some((a) => a.severity === 'HIGH');
    const hasMed = anomalies.some((a) => a.severity === 'MEDIUM');
    const systemHealth = hasHigh
      ? 'CRITICAL'
      : hasMed || anomalies.length > 0
        ? 'WARNING'
        : 'OK';

    let finalAssessment;
    if (activeFlowsCount === 0) {
      finalAssessment = `No ACTIVE_FLOW for ${range.date}. ${inactiveDrivers} driver(s) inactive, ${historicalBalances} carry historical balances; nothing to flag.`;
    } else if (anomalies.length === 0) {
      finalAssessment = `${activeFlowsCount} active driver(s) on ${range.date} reconcile cleanly. ${historicalBalances} historical balance(s) carried (ignored). ${auditGaps.length} audit event class(es) missing.`;
    } else {
      const top = anomalies[0];
      finalAssessment = `${anomalies.length} real anomaly/anomalies detected for ${range.date} across ${activeFlowsCount} active driver(s); top issue: ${top.type} (${top.amount} KD, ${top.responsible}).`;
    }

    const report = {
      systemHealth,
      validation: {
        inactiveDrivers,
        historicalBalances,
        activeFlows: activeFlowsCount,
      },
      summary: {
        totalFlows,
        validFlows,
        issues: issuesCount,
      },
      flows,
      anomalies,
      ignoredCases,
      auditGaps,
      finalAssessment,
      _meta: {
        date: range.date,
        scope: 'ALL_BRANCHES',
        timezone: 'Asia/Kuwait',
        ordersInspected: todayCashOrders.length,
        heldOrdersInspected: heldCashOrders.length,
        shiftsInspected: shifts.length,
        custodiesInspected: custodiesAll.length,
        bankDepositsInspected: bankDeposits.length,
        auditLogsInspected: auditLogs.length,
        driversClassified: driverContexts.length,
      },
    };

    process.stdout.write(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
  }
}

/**
 * Custody is "overdue" only after Kuwait 18:00 of the same day it was
 * received — gives accountants a full business day to register the
 * deposit before we mark it CUSTODY_WITHOUT_DEPOSIT.
 */
function custodyIsOverdueToday(receivedAt) {
  if (!receivedAt) return false;
  const recT = receivedAt instanceof Date ? receivedAt.getTime() : new Date(receivedAt).getTime();
  if (!Number.isFinite(recT)) return false;
  const recDayKw = kuwaitDayOf(receivedAt);
  if (recDayKw !== todayKuwait()) return true; // older custody — already overdue
  // Same Kuwait day; require local 18:00 to have passed.
  const nowKwHour = new Date(Date.now() + KUWAIT_OFFSET_MIN * 60_000).getUTCHours();
  return nowKwHour >= 18;
}

main().catch((err) => {
  process.stderr.write(
    `strict_financial_audit_failed: ${err.message}\n${err.stack || ''}\n`,
  );
  process.exit(1);
});
