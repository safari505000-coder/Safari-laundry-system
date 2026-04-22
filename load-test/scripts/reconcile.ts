/**
 * Post-stage reconciliation — hits the three debt/collections endpoints and
 * proves Σ open-debt-by-issuer == /unpaid-invoices.openDebtKd ==
 * /collections.totalMarketDebtKd to the fils.
 *
 * Usage: tsx load-test/scripts/reconcile.ts [stage-label]
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as http from 'http';

const BASE = 'http://localhost:3001';
const STAGE = process.argv[2] ?? 'ad-hoc';

function req<T = any>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const r = http.request(
      {
        hostname: 'localhost',
        port: 3001,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        timeout: 15000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            resolve(buf ? JSON.parse(buf) : ({} as T));
          } catch (err) {
            reject(new Error(`parse fail: ${path}: ${String(err)}; raw=${buf.slice(0, 200)}`));
          }
        });
      },
    );
    r.on('error', reject);
    r.on('timeout', () => r.destroy(new Error('timeout')));
    if (data) r.write(data);
    r.end();
  });
}

async function main(): Promise<void> {
  const login = await req<{ data: { accessToken: string } }>(
    'POST',
    '/api/auth/login',
    { username: 'admin', password: 'admin' },
  );
  const token = login.data.accessToken;

  const [issuer, unpaid, ops] = await Promise.all([
    req('GET', '/api/finance/reports/open-debt-by-issuer', undefined, token),
    req('GET', '/api/finance/reports/unpaid-invoices', undefined, token),
    req(
      'GET',
      '/api/call-center/operations-summary?windowHours=24',
      undefined,
      token,
    ),
  ]);

  const issuerRows: Array<{ issuerGroup: string; openDebtKd: number }> =
    issuer?.data?.rows ?? [];
  const issuerSum = issuerRows.reduce((s, r) => s + Number(r.openDebtKd || 0), 0);

  const unpaidOpen = Number(
    unpaid?.data?.kpis?.openDebtKd ?? unpaid?.data?.openDebtKd ?? 0,
  );
  const collectionsTotal = Number(
    ops?.data?.collections?.totalMarketDebtKd ??
      ops?.data?.totalMarketDebtKd ??
      0,
  );

  const maxDelta = Math.max(
    Math.abs(issuerSum - unpaidOpen),
    Math.abs(issuerSum - collectionsTotal),
    Math.abs(unpaidOpen - collectionsTotal),
  );
  const status = maxDelta < 0.001 ? 'MATCH' : 'DRIFT';

  const record = {
    stage: STAGE,
    at: new Date().toISOString(),
    status,
    issuerSumKd: issuerSum,
    unpaidInvoicesOpenKd: unpaidOpen,
    collectionsTotalKd: collectionsTotal,
    maxDeltaKd: maxDelta,
    issuerRows,
  };
  fs.appendFileSync(
    'load-test/reports/reconciliation.jsonl',
    JSON.stringify(record) + '\n',
  );
  console.log(
    `[reconcile ${STAGE}] ${status}  issuer=${issuerSum.toFixed(3)} ` +
      `unpaid=${unpaidOpen.toFixed(3)} collections=${collectionsTotal.toFixed(3)} ` +
      `Δ=${maxDelta.toFixed(4)} KWD`,
  );
  if (status !== 'MATCH') process.exitCode = 2;
}

main().catch((err) => {
  console.error('[reconcile] failed:', err);
  process.exit(1);
});
