/**
 * Load test final report generator.
 *
 * Reads:
 *   - load-test/reports/stage-a.json         (Artillery summary JSON)
 *   - load-test/reports/stage-b.json
 *   - load-test/reports/db-monitor.jsonl
 *   - load-test/reports/reconciliation.jsonl
 *
 * Writes: load-test/reports/capacity-report.md
 */
import * as fs from 'fs';
import * as path from 'path';

const REPORTS = path.resolve(__dirname, '..', 'reports');

function readJson<T = any>(name: string): T | null {
  const p = path.join(REPORTS, name);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}
function readJsonl<T = any>(name: string): T[] {
  const p = path.join(REPORTS, name);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as T;
      } catch {
        return null as unknown as T;
      }
    })
    .filter(Boolean);
}

function fmt(n: number | undefined, digits = 0): string {
  if (n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function summariseArtillery(j: any, label: string): string {
  if (!j) return `### ${label}\n\n_no report found_\n`;
  const agg = j.aggregate ?? {};
  const counters = agg.counters ?? {};
  const summaries = agg.summaries ?? {};
  const rt = summaries['http.response_time'] ?? {};
  const codes = Object.entries(counters)
    .filter(([k]) => k.startsWith('http.codes.'))
    .map(([k, v]) => `  - ${k.replace('http.codes.', 'HTTP ')}: **${v}**`)
    .join('\n');
  const errors = Object.entries(counters)
    .filter(([k]) => k.startsWith('errors.'))
    .map(([k, v]) => `  - ${k}: **${v}**`)
    .join('\n');
  const requests = counters['http.requests'] ?? 0;
  const responses = counters['http.responses'] ?? 0;
  const durationSec =
    (new Date(j.aggregate?.lastMetricAt ?? j.aggregate?.lastCounterAt ?? Date.now()).getTime() -
      new Date(j.aggregate?.firstMetricAt ?? j.aggregate?.firstCounterAt ?? Date.now()).getTime()) /
    1000;
  const rps = durationSec > 0 ? requests / durationSec : 0;

  const perEndpoint = Object.entries(summaries)
    .filter(([k]) => k.startsWith('plugins.metrics-by-endpoint.'))
    .slice(0, 20)
    .map(([k, v]: [string, any]) => {
      const name = k.replace(
        'plugins.metrics-by-endpoint.response_time.',
        '',
      );
      if (!v?.p50) return null;
      return `  | ${name} | ${fmt(v.count)} | ${fmt(v.p50, 0)} | ${fmt(v.p95, 0)} | ${fmt(v.p99, 0)} |`;
    })
    .filter(Boolean)
    .join('\n');

  return [
    `### ${label}`,
    ``,
    `- Requests sent: **${fmt(requests)}** (responses: ${fmt(responses)})`,
    `- Wall-clock duration: **${fmt(durationSec, 1)}s** — throughput **${fmt(rps, 1)} req/s**`,
    `- Response time p50/p95/p99: **${fmt(rt.p50, 0)} / ${fmt(rt.p95, 0)} / ${fmt(rt.p99, 0)} ms**`,
    `- Max RT: **${fmt(rt.max, 0)} ms**`,
    ``,
    `**HTTP status breakdown**`,
    codes || '  _none_',
    ``,
    `**Errors**`,
    errors || '  _none_',
    ``,
    `**Per-endpoint latency (p50 / p95 / p99 ms)**`,
    ``,
    `  | Endpoint | count | p50 | p95 | p99 |`,
    `  |---|---:|---:|---:|---:|`,
    perEndpoint || '  | — | — | — | — | — |',
    ``,
  ].join('\n');
}

function summariseDbMonitor(rows: any[]): string {
  if (rows.length === 0) return '_no DB monitor data_';
  const actives = rows.map((r) => Number(r?.conn?.active ?? 0));
  const ledger = rows.map((r) => Number(r?.ledger_rows ?? 0));
  const max = (a: number[]) => (a.length ? Math.max(...a) : 0);
  const final = rows[rows.length - 1];
  return [
    `- Samples: **${rows.length}** (every 2s)`,
    `- Peak active PG connections: **${max(actives)}**`,
    `- DebtLedgerEntry rows grew from **${fmt(ledger[0])}** → **${fmt(ledger[ledger.length - 1])}**`,
    `- Final DB size: **${fmt((Number(final?.db_bytes) ?? 0) / 1024 / 1024, 1)} MiB**`,
  ].join('\n');
}

function summariseReconciliation(rows: any[]): string {
  if (rows.length === 0) return '_no reconciliation checks_';
  return rows
    .map(
      (r) =>
        `  - **${r.stage}**: ${r.status} — issuer=${fmt(r.issuerSumKd, 3)} · ` +
        `unpaid=${fmt(r.unpaidInvoicesOpenKd, 3)} · ` +
        `collections=${fmt(r.collectionsTotalKd, 3)} · Δ=${fmt(r.maxDeltaKd, 4)} KWD`,
    )
    .join('\n');
}

function extractCapacityVerdict(stageA: any, stageB: any): string {
  const rt95A = stageA?.aggregate?.summaries?.['http.response_time']?.p95 ?? null;
  const rt95B = stageB?.aggregate?.summaries?.['http.response_time']?.p95 ?? null;
  const err5xxA = Object.entries(stageA?.aggregate?.counters ?? {})
    .filter(([k]) => k.startsWith('http.codes.5'))
    .reduce((s, [, v]) => s + Number(v), 0);
  const err5xxB = Object.entries(stageB?.aggregate?.counters ?? {})
    .filter(([k]) => k.startsWith('http.codes.5'))
    .reduce((s, [, v]) => s + Number(v), 0);

  const verdict = [
    `### Capacity verdict`,
    ``,
    `- **Concurrent drivers scenario (50 → 1000)**: p95 = **${fmt(rt95A, 0)} ms**, 5xx = **${err5xxA}**`,
    `- **Invoice throughput scenario (100 → 2000 / min)**: p95 = **${fmt(rt95B, 0)} ms**, 5xx = **${err5xxB}**`,
    ``,
    rt95A !== null && rt95A < 200
      ? `- PASS: drivers scenario kept p95 under the 200ms target across all stages.`
      : `- WARN: drivers scenario exceeded the 200ms p95 target at peak — see per-endpoint breakdown.`,
    err5xxB === 0
      ? `- PASS: no 5xx errors during the 2000/min invoice run.`
      : `- WARN: ${err5xxB} server errors during invoice throughput run — investigate backend log.`,
    ``,
  ].join('\n');
  return verdict;
}

function main(): void {
  const stageA = readJson('stage-a.json');
  const stageB = readJson('stage-b.json');
  const dbRows = readJsonl('db-monitor.jsonl');
  const reconRows = readJsonl('reconciliation.jsonl');

  const md = [
    `# Safari-ERP — Load test capacity report`,
    ``,
    `_Generated ${new Date().toISOString()}_`,
    ``,
    `**Environment**`,
    `- Backend: local Node (port 3001) against local Postgres 17 (\`safari_loadtest\`)`,
    `- Seed: 1 branch · 1 manager · 1000 drivers · 200 customers · 41 laundry price-list rows`,
    `- Payments: \`PAYMENTS_MOCK=true\` (devMock callback is HMAC-bypassed)`,
    `- Working-hours gate: bypassed via \`AUTH_BYPASS_WORKING_HOURS=1\``,
    ``,
    extractCapacityVerdict(stageA, stageB),
    summariseArtillery(stageA, 'Stage A — Concurrent drivers (50 → 1000)'),
    summariseArtillery(stageB, 'Stage B — Invoice throughput (100 → 2000 / min)'),
    `### Postgres monitor`,
    ``,
    summariseDbMonitor(dbRows),
    ``,
    `### Reconciliation — ledger consistency between reports`,
    ``,
    summariseReconciliation(reconRows),
    ``,
    `---`,
    ``,
    `Raw artefacts:`,
    `- \`load-test/reports/stage-a.json\` / \`stage-b.json\` — Artillery aggregate`,
    `- \`load-test/reports/db-monitor.jsonl\` — per-sample DB stats`,
    `- \`load-test/reports/reconciliation.jsonl\` — Σ-check records`,
    ``,
  ].join('\n');

  const out = path.join(REPORTS, 'capacity-report.md');
  fs.writeFileSync(out, md, 'utf8');
  console.log(`Wrote ${out}`);
}

main();
