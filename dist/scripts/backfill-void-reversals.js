"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("@prisma/client");
const pg_1 = require("pg");
const DRY = process.argv.includes('--dry-run');
const connectionString = process.env.DATABASE_URL;
if (!connectionString?.trim()) {
    throw new Error('DATABASE_URL is not set');
}
const pool = new pg_1.Pool({ connectionString });
const prisma = new client_1.PrismaClient({ adapter: new adapter_pg_1.PrismaPg(pool) });
async function main() {
    console.log(`--- V19.11 void/edit reversal backfill${DRY ? ' [DRY-RUN]' : ''} ---`);
    const audits = await prisma.invoiceAuditLog.findMany({
        where: {
            action: { in: [client_1.InvoiceAuditAction.VOID, client_1.InvoiceAuditAction.EDIT] },
        },
        orderBy: { createdAt: 'asc' },
        select: {
            id: true,
            action: true,
            orderId: true,
            actorId: true,
            beforeSnapshot: true,
            createdAt: true,
        },
    });
    const existing = await prisma.debtLedgerEntry.findMany({
        where: {
            source: client_1.DebtSource.PAYMENT,
            sourceRef: { startsWith: 'AUDIT:' },
        },
        select: { sourceRef: true },
    });
    const existingRefs = new Set(existing.map((e) => e.sourceRef));
    console.log(`${audits.length} audit rows scanned, ${existingRefs.size} already backfilled`);
    let created = 0;
    let skippedNonDebt = 0;
    for (const a of audits) {
        const ref = `AUDIT:${a.id}`;
        if (existingRefs.has(ref))
            continue;
        const snap = a.beforeSnapshot ?? {};
        const method = snap.posPaymentMethod;
        const totalStr = snap.totalPrice;
        const customerId = snap.customerId;
        if (method !== client_1.PosPaymentMethod.DEBT_ON_ACCOUNT ||
            !totalStr ||
            !customerId ||
            !a.orderId) {
            skippedNonDebt += 1;
            continue;
        }
        const amount = Number.parseFloat(totalStr);
        if (!Number.isFinite(amount) || amount <= 0)
            continue;
        if (DRY) {
            created += 1;
            continue;
        }
        try {
            await prisma.debtLedgerEntry.create({
                data: {
                    customerId,
                    orderId: a.orderId,
                    source: client_1.DebtSource.PAYMENT,
                    category: client_1.DebtEntityCategory.BRANCH,
                    amount: totalStr,
                    actorUserId: a.actorId,
                    note: a.action === client_1.InvoiceAuditAction.VOID
                        ? 'Backfill — debt cleared by invoice void'
                        : 'Backfill — debt reversed during invoice edit',
                    sourceRef: ref,
                    createdAt: a.createdAt,
                },
            });
            created += 1;
        }
        catch (e) {
            console.warn(`audit ${a.id} failed:`, String(e).slice(0, 200));
        }
    }
    console.log(`created: ${created}, skipped (non-DEBT_ON_ACCOUNT): ${skippedNonDebt}`);
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
//# sourceMappingURL=backfill-void-reversals.js.map