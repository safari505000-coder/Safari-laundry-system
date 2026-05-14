#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * V20.3.2 — Phase 7 legacy debt-reader detector.
 *
 * Static scanner that walks the repo (`src/` + `web/src/`) and
 * flags every line that still reads from a legacy debt source
 * the V20.3.2 unification expects to retire from UI / aggregate
 * paths. The script is read-only — it never mutates code.
 *
 * Why it matters: post-V20.3.2 every UI surface is supposed to
 * read the canonical debt via `computeCanonicalCustomerDebt`,
 * `OrdersService.getCollectionsReceivableSnapshotForCustomer`,
 * or `JournalSourceService.getCustomerDebtFromJournalAR`. A
 * fresh `wallet.debt` consumer in a UI render path silently
 * reintroduces the drift bug the inspector now flags as
 * `LEGACY_READER`.
 *
 * Usage:
 *   npx tsx scripts/find-legacy-debt-readers.ts            # default scan
 *   npx tsx scripts/find-legacy-debt-readers.ts --json     # JSON output
 *   npx tsx scripts/find-legacy-debt-readers.ts --strict   # exit 1 on hits
 *
 * Output (text mode):
 *   [LEGACY_READER_FOUND] <file>:<line> "<snippet>"
 *     suggested: <replacement>
 *
 * The scanner is intentionally generous on the patterns it
 * matches and conservative on where it skips:
 *   • Skip `node_modules`, `dist`, `build`, `.next`, coverage,
 *     test fixtures, the inspector itself, AND files that
 *     contain the magic comment `// allow-legacy-debt-reader`.
 *   • Match wallet.debt as a property read, NOT as a write
 *     target (`wallet.debt = …`).
 *
 * Add the magic comment ABOVE a line to whitelist a single
 * authoritative reader (e.g. inside `customer-ledger.service.ts`
 * where `wallet.debt` is the source of truth, or inside the
 * audit / reconciliation services where the legacy column is
 * intentionally compared against the canonical number).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const SCAN_ROOTS = [resolve(ROOT, 'src'), resolve(ROOT, 'web', 'src')];

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.cache',
  'coverage',
  '__snapshots__',
  '.git',
]);

// Files that legitimately consume the legacy reads (writers,
// reconcilers, comparators). Use repo-relative paths.
//
// V20.6 — Phase 2 expansion:
//   • invoice-audit/        — forensic audit reads BOTH legacy and
//                             canonical to detect drift; intentional.
//   • accounting/           — accounting reconciliation.
//   • reports/              — server-side aggregates over primaries.
//   • feedback/             — feedback service summarises invoice $.
//   • bootstrap/            — V20.4 startup warning audits the legacy
//                             surface intentionally.
//   • customer-notifications/, subscribers/, commissions/, serials/,
//     debt-transfers/, read-models/, finance/snapshots/,
//     finance/services/, finance/fraud/, finance/collections-intelligence/,
//     finance/debt-visibility/, finance/timeline/ — server services
//     that derive canonical values from primaries; the field-name
//     `wallet.debt` / `Order.totalPrice` here is the source-of-truth
//     read, NOT a UI render.
//   • payments/, call-center/, customers/ controllers/services/dto —
//     thin response builders that pass server-canonical data through.
//   • V24 — Wave B (Frontend Purge):
//       - finance/sales-debt-analytics/ is the server-side
//         replacement for the deleted FE
//         `web/src/lib/sales-debt-analytics.ts` helper. It
//         legitimately aggregates `Order.totalPrice` (gross
//         sales) into per-branch / per-driver totals — the
//         "Sales vs Debt management" view that has always been
//         distinct from the canonical-debt surface. The
//         `// allow-legacy-debt-reader (V20.6 Phase 2…)` pragmas
//         that lived in the deleted FE helper now travel to the
//         server inside the service docblock.
const PATH_ALLOWLIST_RE = /(?:[\\/])(?:scripts[\\/]find-legacy-debt-readers|finance[\\/]audit[\\/]|customer-ledger[\\/]|finance[\\/]debt-customer-aggregates\.util|general-ledger[\\/]|prisma[\\/]|orders[\\/]debt-kd-breakdown|finance[\\/]canonical-customer-debt\.util|finance[\\/]services[\\/]debt\.service|finance[\\/]invoice-payment-status\.service|common[\\/]services[\\/]payments\.service|orders[\\/]orders\.service|finance[\\/]outstanding[\\/]|invoice-audit[\\/]|accounting[\\/]|reports[\\/]|feedback[\\/]|bootstrap[\\/]|customer-notifications[\\/]|subscribers[\\/]|commissions[\\/]|serials[\\/]|debt-transfers[\\/]|read-models[\\/]|finance[\\/]snapshots[\\/]|finance[\\/]services[\\/]|finance[\\/]fraud[\\/]|finance[\\/]collections-intelligence[\\/]|finance[\\/]debt-visibility[\\/]|finance[\\/]timeline[\\/]|finance[\\/]sales-debt-analytics[\\/]|payments[\\/]payments\.controller|call-center[\\/]call-center\.(?:service|controller)|call-center[\\/]dto[\\/])/;

// Magic comment to whitelist a single line.
// V20.6 — Phase 2 also accepts JSX comment style `{/* ... */}`
// and block-comment style `/* ... */` so call-site suppress works
// inside .tsx files where `//` is invalid in JSX child position.
const SUPPRESS_RE = /(?:\/\/|\/\*|\{\/\*)\s*allow-legacy-debt-reader\b/;

// V20.6 — Phase 2: file-level pragma. Adding the comment
// `// allow-legacy-debt-reader (file)` anywhere in the file
// suppresses every match in that file. Use ONLY for files
// whose entire purpose is rendering server-supplied DTO
// analytics (e.g. SalesDebtAnalyticsRow consumers), where
// per-line comments would be noise.
const FILE_SUPPRESS_RE = /\/\/\s*allow-legacy-debt-reader\s*\(\s*file\s*\)/;

/**
 * V20.6 — Phase 2: lines that are JSDoc / block / line comments
 * (`* ...`, `//...`) are ignored. Comments are documentation, not
 * actual code paths, so a JSDoc that mentions `wallet.debt` to
 * forbid its use is not a legacy reader.
 */
const COMMENT_LINE_RE = /^\s*(?:\*|\/\/|\/\*)/;

type Pattern = {
  id: string;
  /** Display label in the output. */
  label: string;
  /** Regex applied to a single line. */
  re: RegExp;
  /** Suggested canonical replacement message. */
  suggested: string;
};

const PATTERNS: Pattern[] = [
  {
    id: 'wallet.debt',
    label: 'wallet.debt',
    // Match `.debt` reads on something named `wallet`. Allow
    // member access, function args, and template literals;
    // EXCLUDE assignment LHS (`wallet.debt =`) and shorthand
    // object property declarations like `{ debt: ... }`.
    re: /\bwallet\.debt\b(?!\s*[:=][^=])/,
    suggested:
      'use OrdersService.getCollectionsReceivableSnapshotForCustomer().remainingKd OR JournalSourceService.getCustomerDebtFromJournalAR()',
  },
  {
    id: 'totalDebt',
    label: 'totalDebt',
    // V20.6 — Phase 2 sharpened pattern. Requires a leading `.`
    // so we match property accesses like `row.totalDebt` /
    // `analytics.totals.totalDebt` and ignore identifier-shaped
    // string literals (`'totalDebt'` column headers, i18n keys
    // like `t('radar.totalDebt')`, etc.) that are not legacy
    // reads but render-time labels.
    re: /\.totalDebt\b(?!\s*[:=][^=])/,
    suggested:
      'use canonicalDebtKd from computeCanonicalCustomerDebt OR remainingDueKd from Outstanding/SubscribersListRow',
  },
  {
    id: 'sumCollectionsDebtTotalKd',
    label: 'sumCollectionsDebtTotalKd',
    // Σ Order.totalPrice (gross) — pre-V20.3.1 red KPI source.
    // V20.3.1 introduced sumCollectionsDebtRemainingKd which is
    // the partial-payment-aware aggregate.
    re: /\bsumCollectionsDebtTotalKd\b/,
    suggested:
      'use OrdersService.sumCollectionsDebtRemainingKd (V20.3.1) for any UI-visible total',
  },
  {
    id: 'cashStatus_filter',
    label: 'cashStatus filter',
    // `cashStatus: UNPAID` filters that drive UI lists are the
    // pre-V20.3.1 way to determine "open invoice"; replace with
    // `remaining_balance > 0.001` waterfall.
    re: /cashStatus\s*:\s*['"]?UNPAID['"]?|cashStatus\s*===?\s*['"]UNPAID['"]/,
    suggested:
      'derive open vs closed from computeOrderRemainingBalancesBatch / InvoicePaymentStatusService',
  },
  {
    id: 'order.totalPrice_in_ui',
    label: 'Order.totalPrice direct UI usage',
    // Catches `order.totalPrice` reads in frontend (web/) or in
    // server response builders. Server-side aggregations that
    // sum gross are still allowed — those live in the path
    // allowlist above.
    re: /\border\.totalPrice\b|\.totalPrice\s*\.\s*toString\b/,
    suggested:
      'render totalAmountKd / paidKd / remainingDueKd from the V20.3.1 InvoicePaymentStatus shape; never reconstitute "still owes" from totalPrice',
  },
  {
    id: 'UNPAIDTotal_alias',
    label: 'UNPAIDTotal aggregate alias',
    // Legacy alias appearing in older queries / KPI labels.
    re: /\bUNPAIDTotal\b/,
    suggested:
      'remove — the canonical aggregate is `remainingDueKd`',
  },
];

type Hit = {
  file: string;
  line: number;
  patternId: string;
  label: string;
  snippet: string;
  suggested: string;
};

/**
 * V25 — Test-infrastructure exclusion.
 *
 * Files under `src/test/` are integration test scaffolding (factories,
 * helpers, setup, financial / RBAC / security `.integration-spec.ts`
 * specs). They legitimately read `wallet.debt` and `order.totalPrice`
 * as DB-invariant assertions against the seeded test database — they
 * are NOT UI render paths or aggregate read paths. The legacy reader
 * scanner is meant to police production code, so we exclude the entire
 * test infrastructure tree.
 *
 * Naming history: the existing `walk()` filter excludes `*.spec.ts` /
 * `*.test.ts`, but the new integration suite uses
 * `*.integration-spec.ts` (dash before "spec"), which `endsWith('.spec.ts')`
 * does not match because the preceding char is `-`, not `.`. Adding
 * `src/test/` to the path skip-list catches the suite by directory
 * regardless of file naming.
 */
const TEST_INFRA_PREFIXES = [
  'src/test/setup/',
  'src/test/factories/',
  'src/test/helpers/',
  'src/test/financial/',
  'src/test/rbac/',
  'src/test/security/',
] as const;

function shouldSkipPath(path: string): boolean {
  if (PATH_ALLOWLIST_RE.test(path)) return true;
  for (const prefix of TEST_INFRA_PREFIXES) {
    if (path.startsWith(prefix)) return true;
  }
  return false;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIR_NAMES.has(name)) continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(p, out);
      continue;
    }
    if (!st.isFile()) continue;
    const ext = extname(name).toLowerCase();
    if (ext !== '.ts' && ext !== '.tsx' && ext !== '.js' && ext !== '.jsx') {
      continue;
    }
    if (name.endsWith('.d.ts')) continue;
    if (name.endsWith('.spec.ts')) continue;
    if (name.endsWith('.spec.tsx')) continue;
    if (name.endsWith('.test.ts')) continue;
    if (name.endsWith('.test.tsx')) continue;
    out.push(p);
  }
  return out;
}

function scanFile(absPath: string): Hit[] {
  const rel = relative(ROOT, absPath).split('\\').join('/');
  if (shouldSkipPath(rel)) return [];
  let body: string;
  try {
    body = readFileSync(absPath, 'utf8');
  } catch {
    return [];
  }
  // V20.6 — Phase 2: file-level pragma honoured first.
  if (FILE_SUPPRESS_RE.test(body)) return [];
  const lines = body.split(/\r?\n/);
  const hits: Hit[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (SUPPRESS_RE.test(line)) continue;
    // V20.6 — Phase 2: comment lines never trigger.
    if (COMMENT_LINE_RE.test(line)) continue;
    // V20.6 — Phase 2: suppress when the magic comment appears in
    // any of the 3 lines above. JSX call-sites often place the
    // suppress comment a few lines above a multi-line expression
    // (e.g. before a `{...}` block whose match is on the inner line).
    let suppressedByLookback = false;
    for (let k = 1; k <= 3 && i - k >= 0; k += 1) {
      if (SUPPRESS_RE.test(lines[i - k])) {
        suppressedByLookback = true;
        break;
      }
    }
    if (suppressedByLookback) continue;
    for (const pat of PATTERNS) {
      const m = pat.re.exec(line);
      if (!m) continue;
      // V20.6 — Phase 2: skip matches inside string literals.
      // Heuristic: count un-escaped quote characters before the
      // match position. An odd count means we're inside a string.
      // This eliminates i18n keys (`t('foo.totalDebt')`), CSV
      // headers (`'totalDebt'`), and template-literal content
      // (`<td>${totalDebt}</td>` is matched only via the actual
      // identifier `totalDebt`, not its string form).
      if (matchInsideString(line, m.index)) continue;
      hits.push({
        file: rel,
        line: i + 1,
        patternId: pat.id,
        label: pat.label,
        snippet: line.trim().slice(0, 240),
        suggested: pat.suggested,
      });
    }
  }
  return hits;
}

function matchInsideString(line: string, idx: number): boolean {
  let single = 0,
    double = 0,
    back = 0;
  for (let i = 0; i < idx; i += 1) {
    const c = line[i];
    if (c === '\\') {
      i += 1; // skip escaped char
      continue;
    }
    if (c === "'" && double === 0 && back === 0) single = single ^ 1;
    else if (c === '"' && single === 0 && back === 0) double = double ^ 1;
    else if (c === '`' && single === 0 && double === 0) back = back ^ 1;
  }
  return single === 1 || double === 1 || back === 1;
}

function main(): number {
  const argv = process.argv.slice(2);
  const wantJson = argv.includes('--json');
  const strict = argv.includes('--strict');

  const files: string[] = [];
  for (const root of SCAN_ROOTS) {
    walk(root, files);
  }

  const allHits: Hit[] = [];
  for (const f of files) {
    allHits.push(...scanFile(f));
  }

  if (wantJson) {
    const summary: Record<string, number> = {};
    for (const h of allHits) {
      summary[h.patternId] = (summary[h.patternId] ?? 0) + 1;
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          totalHits: allHits.length,
          byPattern: summary,
          hits: allHits,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    if (allHits.length === 0) {
      console.log('[LEGACY_READER_FOUND] none — repo is clean.');
    } else {
      for (const h of allHits) {
        console.log(
          `[LEGACY_READER_FOUND] ${h.file}:${h.line} (${h.label}) "${h.snippet}"`,
        );
        console.log(`  suggested: ${h.suggested}`);
      }
      console.log('');
      console.log(`Total hits: ${allHits.length}`);
    }
  }

  if (strict && allHits.length > 0) return 1;
  return 0;
}

process.exit(main());
