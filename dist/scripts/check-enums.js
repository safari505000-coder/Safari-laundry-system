"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const pg_1 = require("pg");
const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
    for (const enumName of ['DebtSource', 'CashStatus']) {
        const res = await pool.query(`SELECT enumlabel FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = $1
         ORDER BY e.enumsortorder`, [enumName]);
        console.log(`${enumName}:`, res.rows.map((r) => r.enumlabel));
    }
    await pool.end();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=check-enums.js.map