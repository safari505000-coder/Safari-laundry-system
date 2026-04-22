"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("@prisma/client");
const pg_1 = require("pg");
const connectionString = process.env.DATABASE_URL;
if (!connectionString?.trim())
    throw new Error('DATABASE_URL is not set');
const pool = new pg_1.Pool({ connectionString });
const prisma = new client_1.PrismaClient({ adapter: new adapter_pg_1.PrismaPg(pool) });
const ELECTRONIC = [
    client_1.PosPaymentMethod.KNET,
    client_1.PosPaymentMethod.PAYMENT_LINK,
    client_1.PosPaymentMethod.ONLINE,
];
async function main() {
    const before = await prisma.order.groupBy({
        by: ['posPaymentMethod', 'cashStatus'],
        where: { posPaymentMethod: { in: [...ELECTRONIC] } },
        _count: { _all: true },
    });
    console.log('Before (electronic orders only):');
    for (const row of before) {
        console.log(`  ${row.posPaymentMethod}  / ${row.cashStatus}  → ${row._count._all}`);
    }
    const { count } = await prisma.order.updateMany({
        where: {
            posPaymentMethod: { in: [...ELECTRONIC] },
            cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
        },
        data: { cashStatus: client_1.CashStatus.PAID_ONLINE },
    });
    console.log(`\nBackfill updated ${count} order(s) → PAID_ONLINE.`);
    const after = await prisma.order.groupBy({
        by: ['posPaymentMethod', 'cashStatus'],
        where: { posPaymentMethod: { in: [...ELECTRONIC] } },
        _count: { _all: true },
    });
    console.log('\nAfter:');
    for (const row of after) {
        console.log(`  ${row.posPaymentMethod}  / ${row.cashStatus}  → ${row._count._all}`);
    }
    await prisma.$disconnect();
    await pool.end();
}
main().catch(async (e) => {
    console.error(e);
    try {
        await prisma.$disconnect();
    }
    catch { }
    try {
        await pool.end();
    }
    catch { }
    process.exit(1);
});
//# sourceMappingURL=backfill-paid-online-cashstatus.js.map