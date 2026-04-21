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
const adapter = new adapter_pg_1.PrismaPg(pool);
const prisma = new client_1.PrismaClient({ adapter });
async function main() {
    console.log('--- subscription plans ---');
    const plans = await prisma.subscriptionPlan.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
            id: true,
            name: true,
            salePrice: true,
            actualBalance: true,
            isActive: true,
        },
    });
    if (plans.length === 0) {
        console.log('(no plans)');
    }
    for (const p of plans) {
        const sale = Number(p.salePrice);
        const actual = Number(p.actualBalance);
        const subsidy = actual > sale ? actual - sale : 0;
        console.log(`${p.isActive ? '[A]' : '[-]'}  ${p.name.padEnd(30)}  sale=${sale
            .toFixed(3)
            .padStart(8)}  credit=${actual.toFixed(3).padStart(8)}  subsidy=${subsidy.toFixed(3)}`);
    }
    console.log('');
    console.log('--- last 10 SUBSCRIPTION_ACTIVATION activations ---');
    const rows = await prisma.transactionHistory.findMany({
        where: { type: 'SUBSCRIPTION_ACTIVATION' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, createdAt: true, metadata: true, amount: true },
    });
    if (rows.length === 0) {
        console.log('(no subscription activations yet)');
    }
    for (const r of rows) {
        const meta = (r.metadata ?? {});
        const subsidy = typeof meta.subsidy === 'string' ? meta.subsidy : '0';
        const plan = typeof meta.planName === 'string' ? meta.planName : '?';
        console.log(`${r.createdAt.toISOString().slice(0, 19)}  plan=${plan.padEnd(25)}  amount=${Number(r.amount)
            .toFixed(3)
            .padStart(8)}  meta.subsidy=${subsidy}`);
    }
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=check-subscription-subsidies.js.map