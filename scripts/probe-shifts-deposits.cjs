/* eslint-disable */
'use strict';
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env'), quiet: true });

const KUWAIT_OFFSET_MIN = 180;
function todayKuwait() {
  const local = new Date(Date.now() + KUWAIT_OFFSET_MIN * 60_000);
  return local.toISOString().slice(0, 10);
}
function range(date) {
  const [y, m, d] = date.split('-').map(Number);
  const fromMs = Date.UTC(y, m - 1, d) - KUWAIT_OFFSET_MIN * 60_000;
  return { from: new Date(fromMs), to: new Date(fromMs + 86400000) };
}
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const r = range(process.env.AUDIT_DATE || todayKuwait());
    const [shifts, deposits, custodies, allOrdersAnyDate] = await Promise.all([
      prisma.shift.findMany({
        where: { OR: [{ startedAt: { gte: r.from, lt: r.to } }, { endedAt: { gte: r.from, lt: r.to } }, { confirmedAt: { gte: r.from, lt: r.to } }] },
        select: { id: true, driverId: true, status: true, startedAt: true, endedAt: true, declaredHandoverTotal: true, systemHandoverTotal: true, ordersSettledCount: true, confirmedByManagerId: true, confirmedAt: true, bankDepositReceiptUrl: true },
      }),
      prisma.bankDepositLog.findMany({
        where: { OR: [{ createdAt: { gte: r.from, lt: r.to } }, { verifiedAt: { gte: r.from, lt: r.to } }] },
        select: { id: true, depositType: true, status: true, amountKd: true, shiftId: true, managerCashCustodyId: true, uploadedById: true, verifiedByAccountantId: true, verifiedAt: true, createdAt: true },
      }),
      prisma.managerCashCustody.count({
        where: { OR: [{ receivedFromDriverAt: { gte: r.from, lt: r.to } }, { slipUploadedAt: { gte: r.from, lt: r.to } }, { verifiedAt: { gte: r.from, lt: r.to } }, { rejectedAt: { gte: r.from, lt: r.to } }, { createdAt: { gte: r.from, lt: r.to } }] },
      }),
      prisma.order.count(),
    ]);
    const out = { shifts: shifts.map(s => ({...s, declaredHandoverTotal: s.declaredHandoverTotal?.toString() ?? null, systemHandoverTotal: s.systemHandoverTotal?.toString() ?? null})), deposits: deposits.map(d => ({...d, amountKd: d.amountKd.toString()})), custodiesTodayCount: custodies, allOrdersAnyDate };
    process.stdout.write(JSON.stringify(out, null, 2));
  } finally {
    await prisma.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
  }
})().catch((e) => { process.stderr.write(e.message); process.exit(1); });
