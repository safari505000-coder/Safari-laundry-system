/* eslint-disable */
'use strict';
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env'), quiet: true });
const KW = 180;
function todayKuwait() { const local = new Date(Date.now() + KW * 60_000); return local.toISOString().slice(0, 10); }
function range(date) { const [y, m, d] = date.split('-').map(Number); const fromMs = Date.UTC(y, m - 1, d) - KW * 60_000; return { from: new Date(fromMs), to: new Date(fromMs + 86400000) }; }
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const r = range(process.env.AUDIT_DATE || todayKuwait());
    const deposits = await prisma.bankDepositLog.findMany({
      where: { OR: [{ createdAt: { gte: r.from, lt: r.to } }, { verifiedAt: { gte: r.from, lt: r.to } }, { updatedAt: { gte: r.from, lt: r.to } }] },
      select: { id: true, depositType: true, status: true, amountKd: true, shiftId: true, managerCashCustodyId: true, uploadedById: true, verifiedByAccountantId: true, verifiedAt: true, createdAt: true, updatedAt: true },
    });
    process.stdout.write(JSON.stringify(deposits.map(d => ({...d, amountKd: d.amountKd.toString()})), null, 2));
  } finally {
    await prisma.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
  }
})().catch(e => { process.stderr.write(e.message); process.exit(1); });
