"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fs = __importStar(require("fs"));
const pg_1 = require("pg");
const outPath = process.argv[2] ?? 'load-test/reports/db-monitor.jsonl';
const intervalMs = Number.parseInt(process.argv[3] ?? '2000', 10);
const connectionString = process.env.DATABASE_URL ??
    'postgresql://postgres@localhost:5432/safari_loadtest';
const pool = new pg_1.Pool({ connectionString, max: 2 });
async function sample() {
    const client = await pool.connect();
    try {
        const [conn, counts, locks, stats, ledgerSize,] = await Promise.all([
            client.query(`SELECT count(*) FILTER (WHERE state='active') AS active,
                count(*) AS total,
                current_setting('max_connections')::int AS max
         FROM pg_stat_activity`),
            client.query(`SELECT xact_commit, xact_rollback, tup_inserted, tup_updated, tup_deleted,
                blks_read, blks_hit
         FROM pg_stat_database WHERE datname = current_database()`),
            client.query(`SELECT count(*) AS cnt
         FROM pg_locks l JOIN pg_class c ON l.relation = c.oid
         WHERE c.relname = 'DebtLedgerEntry' AND l.granted = true`),
            client.query(`SELECT pg_database_size(current_database()) AS db_bytes`),
            client.query(`SELECT count(*)::bigint AS rows FROM "DebtLedgerEntry"`),
        ]);
        return {
            ts: new Date().toISOString(),
            conn: conn.rows[0],
            counts: counts.rows[0],
            locks: Number(locks.rows[0].cnt),
            db_bytes: Number(stats.rows[0].db_bytes),
            ledger_rows: Number(ledgerSize.rows[0].rows),
        };
    }
    finally {
        client.release();
    }
}
async function main() {
    fs.mkdirSync(require('path').dirname(outPath), { recursive: true });
    const stream = fs.createWriteStream(outPath, { flags: 'a' });
    process.on('SIGINT', () => {
        stream.end();
        void pool.end().finally(() => process.exit(0));
    });
    process.on('SIGTERM', () => {
        stream.end();
        void pool.end().finally(() => process.exit(0));
    });
    while (true) {
        try {
            const row = await sample();
            stream.write(JSON.stringify(row) + '\n');
            process.stdout.write(`[db-monitor] active=${row.conn.active}/${row.conn.max} ` +
                `commits=${row.counts.xact_commit} ledger=${row.ledger_rows}\n`);
        }
        catch (err) {
            stream.write(JSON.stringify({ ts: new Date().toISOString(), err: String(err) }) + '\n');
        }
        await new Promise((r) => setTimeout(r, intervalMs));
    }
}
void main();
//# sourceMappingURL=db-monitor.js.map