"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("@prisma/client");
const pg_1 = require("pg");
const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
const client = new client_1.PrismaClient({ adapter: new adapter_pg_1.PrismaPg(pool) });
console.log('direct access type:', typeof client.debtLedgerEntry);
console.log('proto has:', Object.getPrototypeOf(client).hasOwnProperty('debtLedgerEntry'));
console.log('own has:', Object.prototype.hasOwnProperty.call(client, 'debtLedgerEntry'));
console.log('is object:', client.debtLedgerEntry && typeof client.debtLedgerEntry === 'object');
client.$disconnect().then(() => pool.end());
//# sourceMappingURL=probe-delegate.js.map