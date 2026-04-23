"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
async function main() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('DATABASE_URL missing');
        process.exit(1);
    }
    const pool = new pg_1.Pool({ connectionString });
    const prisma = new client_1.PrismaClient({ adapter: new adapter_pg_1.PrismaPg(pool) });
    const rows = await prisma.order.findMany({
        where: { cashStatus: 'UNPAID', status: 'PENDING' },
        select: {
            id: true,
            invoiceNumber: true,
            posHostedPaymentUrl: true,
            posGatewayTrackId: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
    });
    console.log('Unpaid orders:');
    for (const r of rows) {
        console.log(`  ${r.invoiceNumber ?? r.id.slice(0, 8)}  trackId=${r.posGatewayTrackId ?? '-'}  url=${(r.posHostedPaymentUrl ?? '').slice(0, 60)}`);
    }
    const withUrl = rows.filter((r) => r.posHostedPaymentUrl).length;
    const withTrack = rows.filter((r) => r.posGatewayTrackId).length;
    console.log(`\ntotal=${rows.length}  withUrl=${withUrl}  withTrackId=${withTrack}`);
    await prisma.$disconnect();
}
main().catch((e) => {
    console.error('ERR', e);
    process.exit(1);
});
//# sourceMappingURL=check-orders.js.map