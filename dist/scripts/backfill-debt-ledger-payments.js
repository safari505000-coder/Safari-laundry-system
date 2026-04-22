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
function extractDebtSettledKd(meta) {
    if (!meta)
        return null;
    const v = meta.debtSettled;
    if (typeof v === 'string') {
        const n = Number.parseFloat(v);
        return Number.isFinite(n) && n > 0 ? v : null;
    }
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        return String(v);
    }
    return null;
}
function resolveCategory(role) {
    if (role === client_1.SafariRole.OWNER)
        return client_1.DebtEntityCategory.OWNER;
    if (role === client_1.SafariRole.DRIVER)
        return client_1.DebtEntityCategory.DRIVER;
    if (role === client_1.SafariRole.CALL_CENTER ||
        role === client_1.SafariRole.CALL_CENTER_SUPERVISOR)
        return client_1.DebtEntityCategory.CALL_CENTER;
    return client_1.DebtEntityCategory.BRANCH;
}
async function main() {
    console.log(`--- V19.11 DebtLedgerEntry PAYMENT backfill${DRY ? ' [DRY-RUN]' : ''} ---`);
    const rows = await prisma.transactionHistory.findMany({
        where: {
            type: {
                in: [
                    client_1.LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
                    client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
                ],
            },
        },
        orderBy: { createdAt: 'asc' },
        select: {
            id: true,
            type: true,
            customerId: true,
            orderId: true,
            performedById: true,
            metadata: true,
            createdAt: true,
        },
    });
    console.log(`scanned ${rows.length} TransactionHistory rows`);
    const actorIds = Array.from(new Set(rows.map((r) => r.performedById).filter((x) => !!x)));
    const actors = await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, safariRole: true, branchId: true },
    });
    const actorMap = new Map(actors.map((a) => [a.id, a]));
    const existing = await prisma.debtLedgerEntry.findMany({
        where: {
            source: client_1.DebtSource.PAYMENT,
            sourceRef: { not: null },
        },
        select: { sourceRef: true },
    });
    const existingRefs = new Set(existing.map((e) => e.sourceRef));
    console.log(`found ${existingRefs.size} PAYMENT rows already backfilled`);
    let created = 0;
    let skippedExisting = 0;
    let skippedZero = 0;
    let skippedNoOrder = 0;
    let totalSettledKd = 0;
    for (const r of rows) {
        const sourceRef = `TH:${r.id}`;
        if (existingRefs.has(sourceRef)) {
            skippedExisting += 1;
            continue;
        }
        const settledStr = extractDebtSettledKd(r.metadata);
        if (!settledStr) {
            skippedZero += 1;
            continue;
        }
        const amount = Number.parseFloat(settledStr);
        totalSettledKd += amount;
        const actor = r.performedById ? actorMap.get(r.performedById) : null;
        const category = resolveCategory(actor?.safariRole);
        const branchId = actor?.branchId ?? null;
        if (DRY) {
            created += 1;
            continue;
        }
        try {
            await prisma.debtLedgerEntry.create({
                data: {
                    customerId: r.customerId,
                    orderId: r.orderId ?? null,
                    source: client_1.DebtSource.PAYMENT,
                    category,
                    amount: settledStr,
                    branchId,
                    actorUserId: r.performedById ?? null,
                    note: r.type === client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION
                        ? 'Backfill — subscription activation settled debt'
                        : 'Backfill — order-wallet settlement (debt payment)',
                    sourceRef,
                    createdAt: r.createdAt,
                },
            });
            created += 1;
        }
        catch (e) {
            if (String(e).includes('sourceRef')) {
                skippedExisting += 1;
            }
            else if (String(e).includes('Foreign key')) {
                skippedNoOrder += 1;
            }
            else {
                console.warn(`row ${r.id} failed:`, String(e).slice(0, 200));
            }
        }
    }
    console.log('--- summary ---');
    console.log(`created (PAYMENT rows):       ${created}`);
    console.log(`already-backfilled:           ${skippedExisting}`);
    console.log(`zero/no-debtSettled:          ${skippedZero}`);
    console.log(`FK violations (order gone):   ${skippedNoOrder}`);
    console.log(`total debtSettled observed:   ${totalSettledKd.toFixed(3)} KD`);
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
//# sourceMappingURL=backfill-debt-ledger-payments.js.map