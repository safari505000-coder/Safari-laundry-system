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
    const before = await prisma.role.findUnique({ where: { name: 'GENERAL_MANAGER' } });
    const row = await prisma.role.upsert({
        where: { name: 'GENERAL_MANAGER' },
        update: {},
        create: { name: 'GENERAL_MANAGER' },
    });
    console.log(JSON.stringify({
        action: before ? 'already_present' : 'created',
        id: row.id,
        name: row.name,
        createdAt: row.createdAt,
    }, null, 2));
    const all = await prisma.role.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
    });
    console.log('\nAll Role rows:');
    for (const r of all)
        console.log(`  - ${r.name}  (${r.id})`);
}
void (async () => {
    try {
        await main();
    }
    catch (err) {
        console.error('[ensure-general-manager-role] FAILED:', err);
        process.exitCode = 1;
    }
    finally {
        await prisma.$disconnect();
        await pool.end();
    }
})();
//# sourceMappingURL=ensure-general-manager-role.js.map