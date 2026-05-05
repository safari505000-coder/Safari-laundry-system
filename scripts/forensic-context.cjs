/* eslint-disable */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

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

async function main() {
  const date = process.env.AUDIT_DATE || (() => {
    const local = new Date(Date.now() + KUWAIT_OFFSET_MIN * 60_000);
    return local.toISOString().slice(0, 10);
  })();
  const range = parseKuwaitDay(date);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const [actionGroups, recentCustody, recentDeposit, recentCashOrder] = await Promise.all([
      prisma.auditLog.groupBy({
        by: ['action'],
        where: { timestamp: { gte: range.from, lt: range.to } },
        _count: { _all: true },
      }),
      prisma.managerCashCustody.findFirst({
        orderBy: { receivedFromDriverAt: 'desc' },
        select: { id: true, receivedFromDriverAt: true, status: true, amountKd: true },
      }),
      prisma.bankDepositLog.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { id: true, createdAt: true, status: true, amountKd: true },
      }),
      prisma.order.findFirst({
        where: { posPaymentMethod: 'CASH' },
        orderBy: { completedAt: 'desc' },
        select: { id: true, completedAt: true, totalPrice: true, cashStatus: true },
      }),
    ]);
    process.stdout.write(JSON.stringify({
      date: range.date,
      windowFromUtc: range.from.toISOString(),
      windowToUtc: range.to.toISOString(),
      auditActionsToday: actionGroups.map((g) => ({ action: g.action, count: g._count._all }))
        .sort((a, b) => b.count - a.count),
      latestCashOrder: recentCashOrder ? {
        id: recentCashOrder.id,
        completedAt: recentCashOrder.completedAt?.toISOString() ?? null,
        totalKd: new Prisma.Decimal(recentCashOrder.totalPrice).toFixed(4),
        cashStatus: recentCashOrder.cashStatus,
      } : null,
      latestCustody: recentCustody ? {
        id: recentCustody.id,
        receivedAt: recentCustody.receivedFromDriverAt?.toISOString() ?? null,
        status: recentCustody.status,
        amountKd: new Prisma.Decimal(recentCustody.amountKd).toFixed(4),
      } : null,
      latestDeposit: recentDeposit ? {
        id: recentDeposit.id,
        createdAt: recentDeposit.createdAt?.toISOString() ?? null,
        status: recentDeposit.status,
        amountKd: new Prisma.Decimal(recentDeposit.amountKd).toFixed(4),
      } : null,
    }, null, 2));
  } finally {
    await prisma.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  process.stderr.write(`forensic_context_failed: ${err.message}\n`);
  process.exit(1);
});
