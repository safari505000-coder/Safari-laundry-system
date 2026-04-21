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
void (async () => {
    try {
        const categories = await prisma.laundryItemCategory.findMany({
            orderBy: { sortOrder: 'asc' },
            include: {
                items: {
                    orderBy: { sortOrder: 'asc' },
                    select: { code: true, nameAr: true, sortOrder: true },
                },
            },
        });
        const orphans = await prisma.laundryPriceListItem.findMany({
            where: { categoryId: null },
            orderBy: { sortOrder: 'asc' },
            select: { code: true, nameAr: true, sortOrder: true },
        });
        const total = await prisma.laundryPriceListItem.count();
        console.log(`\n=== TOTAL ITEMS: ${total} ===\n`);
        for (const c of categories) {
            console.log(`[${c.sortOrder}] ${c.code} — ${c.nameAr} (${c.items.length} items)`);
            for (const it of c.items) {
                console.log(`    ${it.sortOrder}: ${it.code} — ${it.nameAr}`);
            }
        }
        if (orphans.length) {
            console.log(`\n[ORPHANS: no category] (${orphans.length} items)`);
            for (const it of orphans) {
                console.log(`    ${it.sortOrder}: ${it.code} — ${it.nameAr}`);
            }
        }
    }
    finally {
        await prisma.$disconnect();
        await pool.end();
    }
})();
//# sourceMappingURL=check-price-list.js.map