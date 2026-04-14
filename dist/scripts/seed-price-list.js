"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("@prisma/client");
const pg_1 = require("pg");
const ensure_default_price_list_1 = require("../src/bootstrap/ensure-default-price-list");
const connectionString = process.env.DATABASE_URL;
if (!connectionString?.trim()) {
    throw new Error('DATABASE_URL is not set');
}
const pool = new pg_1.Pool({ connectionString });
const adapter = new adapter_pg_1.PrismaPg(pool);
const prisma = new client_1.PrismaClient({ adapter });
void (async () => {
    try {
        await (0, ensure_default_price_list_1.ensureDefaultPriceList)(prisma);
    }
    finally {
        await prisma.$disconnect();
        await pool.end();
    }
})();
//# sourceMappingURL=seed-price-list.js.map