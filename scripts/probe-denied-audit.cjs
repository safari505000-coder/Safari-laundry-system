/* eslint-disable */
'use strict';
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env'), quiet: true });
const KUWAIT_OFFSET_MIN = 180;
function todayKuwait() { const local = new Date(Date.now() + KUWAIT_OFFSET_MIN * 60_000); return local.toISOString().slice(0, 10); }
function range(date) { const [y, m, d] = date.split('-').map(Number); const fromMs = Date.UTC(y, m - 1, d) - KUWAIT_OFFSET_MIN * 60_000; return { from: new Date(fromMs), to: new Date(fromMs + 86400000) }; }
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const r = range(process.env.AUDIT_DATE || todayKuwait());
    const denied = await prisma.auditLog.findMany({
      where: { timestamp: { gte: r.from, lt: r.to }, status: 'DENIED' },
      select: { id: true, action: true, resource: true, endpoint: true, method: true, userId: true, role: true, ip: true, timestamp: true, payload: true },
      orderBy: { timestamp: 'asc' },
    });
    const userIds = [...new Set(denied.map(d => d.userId).filter(Boolean))];
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, username: true, safariRole: true, branchId: true } });
    const userById = new Map(users.map(u => [u.id, u]));
    process.stdout.write(JSON.stringify({
      count: denied.length,
      rows: denied.map(d => ({
        ts: d.timestamp,
        actor: d.userId ? (userById.get(d.userId)?.fullName || userById.get(d.userId)?.username || d.userId) : null,
        actorRole: d.userId ? userById.get(d.userId)?.safariRole : d.role,
        action: d.action,
        endpoint: d.endpoint,
        method: d.method,
        ip: d.ip,
      })),
    }, null, 2));
  } finally {
    await prisma.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
  }
})().catch(e => { process.stderr.write(e.message); process.exit(1); });
