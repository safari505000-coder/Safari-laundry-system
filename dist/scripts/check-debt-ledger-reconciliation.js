"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("@prisma/client");
const pg_1 = require("pg");
const connectionString = process.env.DATABASE_URL;
if (!connectionString?.trim()) {
    throw new Error('DATABASE_URL is not set');
}
const pool = new pg_1.Pool({ connectionString });
const prisma = new client_1.PrismaClient({ adapter: new adapter_pg_1.PrismaPg(pool) });
async function main() {
    const [ledger, wallets] = await Promise.all([
        prisma.debtLedgerEntry.groupBy({
            by: ['customerId', 'source'],
            _sum: { amount: true },
        }),
        prisma.customerWallet.findMany({
            select: { customerId: true, balance: true, debt: true },
        }),
    ]);
    const perCustomer = new Map();
    for (const g of ledger) {
        const cur = perCustomer.get(g.customerId) ?? { debt: 0, payment: 0 };
        const amt = Number.parseFloat(g._sum.amount?.toString() ?? '0');
        if (g.source === client_1.DebtSource.PAYMENT)
            cur.payment += amt;
        else
            cur.debt += amt;
        perCustomer.set(g.customerId, cur);
    }
    const walletByCustomer = new Map();
    for (const w of wallets) {
        const debt = Number.parseFloat(w.debt?.toString() ?? '0');
        const balance = Number.parseFloat(w.balance?.toString() ?? '0');
        const negBalance = balance < 0 ? -balance : 0;
        walletByCustomer.set(w.customerId, (debt > 0 ? debt : 0) + negBalance);
    }
    const customerIds = new Set([
        ...perCustomer.keys(),
        ...walletByCustomer.keys(),
    ]);
    let totalLedger = 0;
    let totalWallet = 0;
    const rows = [];
    for (const cid of customerIds) {
        const { debt = 0, payment = 0 } = perCustomer.get(cid) ?? {};
        const ledgerOpen = Math.max(debt - payment, 0);
        const walletOpen = walletByCustomer.get(cid) ?? 0;
        totalLedger += ledgerOpen;
        totalWallet += walletOpen;
        const delta = ledgerOpen - walletOpen;
        if (Math.abs(delta) > 0.01)
            rows.push({ customerId: cid, ledger: ledgerOpen, wallet: walletOpen, delta });
    }
    rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    console.log('=== V19.11 Debt Ledger ↔ Wallet Reconciliation ===');
    console.log(`customers:            ${customerIds.size}`);
    console.log(`total ledger open:    ${totalLedger.toFixed(3)} KD`);
    console.log(`total wallet open:    ${totalWallet.toFixed(3)} KD`);
    console.log(`mismatches (|Δ|>1fils): ${rows.length}`);
    for (const r of rows.slice(0, 20)) {
        console.log(`  ${r.customerId.slice(0, 8)}  ledger=${r.ledger.toFixed(3)}  wallet=${r.wallet.toFixed(3)}  Δ=${r.delta.toFixed(3)}`);
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
//# sourceMappingURL=check-debt-ledger-reconciliation.js.map