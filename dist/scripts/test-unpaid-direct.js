"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("@prisma/client");
const pg_1 = require("pg");
const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new client_1.PrismaClient({ adapter: new adapter_pg_1.PrismaPg(pool) });
async function main() {
    const where = {
        source: client_1.DebtSource.INVOICE_SHORTFALL,
        orderId: { not: null },
        actorUser: {
            is: { safariRole: { in: [client_1.SafariRole.DRIVER, client_1.SafariRole.MANAGER] } },
        },
    };
    console.log('Step 1: findMany shortfalls...');
    const entries = await prisma.debtLedgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 20_000,
        select: {
            id: true,
            amount: true,
            createdAt: true,
            orderId: true,
            customerId: true,
            branchId: true,
            actorUserId: true,
            customer: {
                select: { id: true, displayName: true, phone: true, phone2: true },
            },
            branch: { select: { id: true, name: true } },
            actorUser: {
                select: { id: true, fullName: true, username: true, safariRole: true },
            },
            order: {
                select: {
                    id: true,
                    serialNumber: true,
                    invoiceNumber: true,
                    totalPrice: true,
                    createdAt: true,
                    completedAt: true,
                },
            },
        },
    });
    console.log(`  entries: ${entries.length}`);
    const orderIds = Array.from(new Set(entries.map((e) => e.orderId).filter(Boolean)));
    const customerIds = Array.from(new Set(entries.map((e) => e.customerId)));
    console.log(`  orderIds: ${orderIds.length}, customerIds: ${customerIds.length}`);
    console.log('Step 2: two parallel groupBy queries...');
    try {
        const [paymentsByOrder, customerLedgerTotals] = await Promise.all([
            orderIds.length
                ? prisma.debtLedgerEntry.groupBy({
                    by: ['orderId'],
                    where: { source: client_1.DebtSource.PAYMENT, orderId: { in: orderIds } },
                    _sum: { amount: true },
                })
                : Promise.resolve([]),
            customerIds.length
                ? prisma.debtLedgerEntry.groupBy({
                    by: ['customerId', 'source'],
                    where: { customerId: { in: customerIds } },
                    _sum: { amount: true },
                })
                : Promise.resolve([]),
        ]);
        console.log(`  OK: paymentsByOrder=${paymentsByOrder.length} customerLedgerTotals=${customerLedgerTotals.length}`);
    }
    catch (e) {
        console.error('  FAIL:', e);
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
//# sourceMappingURL=test-unpaid-direct.js.map