/* eslint-disable */
'use strict';
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env'), quiet: true });

const KUWAIT_OFFSET_MIN = 180;
const DAY_MS = 86400000;
function todayKuwait() {
  const local = new Date(Date.now() + KUWAIT_OFFSET_MIN * 60_000);
  return local.toISOString().slice(0, 10);
}
function range(date) {
  const [y, m, d] = date.split('-').map(Number);
  const fromMs = Date.UTC(y, m - 1, d) - KUWAIT_OFFSET_MIN * 60_000;
  return { from: new Date(fromMs), to: new Date(fromMs + DAY_MS) };
}

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const r = range(process.env.AUDIT_DATE || todayKuwait());
    const rows = await prisma.auditLog.groupBy({
      by: ['action', 'resource', 'status'],
      where: { timestamp: { gte: r.from, lt: r.to } },
      _count: { _all: true },
    });
    rows.sort((a, b) => b._count._all - a._count._all);
    const out = rows.map((row) => ({
      action: row.action,
      resource: row.resource,
      status: row.status,
      count: row._count._all,
    }));
    process.stdout.write(JSON.stringify(out, null, 2));
  } finally {
    await prisma.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
  }
})().catch((e) => {
  process.stderr.write(`probe_failed: ${e.message}\n`);
  process.exit(1);
});
