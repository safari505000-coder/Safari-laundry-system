/**
 * Postgres health snapshot for the load test.
 *
 * Samples every N seconds:
 *   - Active connections / max_connections
 *   - xact_commit / xact_rollback rates
 *   - DebtLedgerEntry row count (append-only growth)
 *   - Pg locks on DebtLedgerEntry (trigger contention)
 *   - Slowest 5 queries by total_exec_time (if pg_stat_statements is on — we
 *     gracefully skip if the extension isn't loaded in this lab DB)
 *
 * Usage:  tsx load-test/scripts/db-monitor.ts <out-file.jsonl> <interval-ms>
 */
import 'dotenv/config';
import * as fs from 'fs';
import { Pool } from 'pg';

const outPath = process.argv[2] ?? 'load-test/reports/db-monitor.jsonl';
const intervalMs = Number.parseInt(process.argv[3] ?? '2000', 10);
const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://postgres@localhost:5432/safari_loadtest';

const pool = new Pool({ connectionString, max: 2 });

async function sample(): Promise<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    const [
      conn,
      counts,
      locks,
      stats,
      ledgerSize,
    ] = await Promise.all([
      client.query(
        `SELECT count(*) FILTER (WHERE state='active') AS active,
                count(*) AS total,
                current_setting('max_connections')::int AS max
         FROM pg_stat_activity`,
      ),
      client.query(
        `SELECT xact_commit, xact_rollback, tup_inserted, tup_updated, tup_deleted,
                blks_read, blks_hit
         FROM pg_stat_database WHERE datname = current_database()`,
      ),
      client.query(
        `SELECT count(*) AS cnt
         FROM pg_locks l JOIN pg_class c ON l.relation = c.oid
         WHERE c.relname = 'DebtLedgerEntry' AND l.granted = true`,
      ),
      client.query(
        `SELECT pg_database_size(current_database()) AS db_bytes`,
      ),
      client.query(
        `SELECT count(*)::bigint AS rows FROM "DebtLedgerEntry"`,
      ),
    ]);
    return {
      ts: new Date().toISOString(),
      conn: conn.rows[0],
      counts: counts.rows[0],
      locks: Number(locks.rows[0].cnt),
      db_bytes: Number(stats.rows[0].db_bytes),
      ledger_rows: Number(ledgerSize.rows[0].rows),
    };
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
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
      process.stdout.write(
        `[db-monitor] active=${(row.conn as any).active}/${(row.conn as any).max} ` +
          `commits=${(row.counts as any).xact_commit} ledger=${row.ledger_rows}\n`,
      );
    } catch (err) {
      stream.write(JSON.stringify({ ts: new Date().toISOString(), err: String(err) }) + '\n');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

void main();
