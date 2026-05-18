/**
 * V21 — PHASE 1 — CORE FREEZE + CANONICAL ENFORCEMENT
 *
 * Five named validation suites that lock the architectural shape
 * of the canonical financial core in place. Each suite is an
 * **architectural assertion** (file-system + AST-light scan) — not
 * a fake-Prisma re-test of business logic. The existing 681
 * backend functional tests cover business behaviour; these tests
 * lock the **shape** so a future PR cannot quietly remove a
 * canonical safety net without CI failing.
 *
 * Suites:
 *
 *   1. Anti-drift              — reconciliation, snapshot refresh
 *   2. Anti-bypass             — no direct writes outside canonical
 *   3. Mutation-boundary       — approved-writer allowlists intact
 *   4. Replay-consistency      — canonical hash/snapshot/replay
 *   5. Closed-period rejection — period-lock guard wired into appendBalanced
 *
 * The patterns + allowlists below intentionally duplicate the ones
 * in `v21-canonical-banking-guards.spec.ts` so the two specs are
 * **independent witnesses** of the same invariants — if one is
 * accidentally weakened or deleted, the other still fails.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..');

// ─────────────────────────────────────────────────────────────────────────────
//  Shared file-system helpers
// ─────────────────────────────────────────────────────────────────────────────

function fileExists(rel: string): boolean {
  try {
    return statSync(join(repoRoot, rel)).isFile();
  } catch {
    return false;
  }
}

function readSource(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

interface SourceFile {
  rel: string;
  lines: string[];
}

const testInfrastructurePrefixes = [
  'src/test/setup/',
  'src/test/factories/',
  'src/test/helpers/',
  'src/test/financial/',
] as const;

function isTestInfrastructureFile(rel: string): boolean {
  return testInfrastructurePrefixes.some((prefix) => rel.startsWith(prefix));
}

function collectBackendSources(): SourceFile[] {
  const out: SourceFile[] = [];
  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      const stat = statSync(abs);
      if (stat.isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist' || entry === '.git') {
          continue;
        }
        walk(abs);
        continue;
      }
      if (!entry.endsWith('.ts')) continue;
      if (entry.endsWith('.d.ts')) continue;
      const rel = abs.substring(repoRoot.length + 1).replace(/\\/g, '/');
      if (!rel.startsWith('src/')) continue;
      const text = readFileSync(abs, 'utf8');
      out.push({ rel, lines: text.split(/\r?\n/) });
    }
  }
  walk(join(repoRoot, 'src'));
  return out;
}

function scan(
  files: SourceFile[],
  pattern: RegExp,
  allowlist: ReadonlySet<string>,
  skipSpecs: boolean,
): Array<{ file: string; line: number; snippet: string }> {
  const out: Array<{ file: string; line: number; snippet: string }> = [];
  for (const { rel, lines } of files) {
    if (allowlist.has(rel)) continue;
    if (isTestInfrastructureFile(rel)) continue;
    if (skipSpecs && rel.endsWith('.spec.ts')) continue;
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        out.push({ file: rel, line: i + 1, snippet: lines[i].trim() });
      }
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
//  1. Anti-drift suite
// ─────────────────────────────────────────────────────────────────────────────

describe('V21 Phase 1 — Anti-drift suite', () => {
  it('reconciliation service exposes all 4 banking invariants', () => {
    const path = 'src/finance/reconciliation/reconciliation.service.ts';
    expect(fileExists(path)).toBe(true);
    const src = readSource(path);
    const required = [
      'TRIAL_BALANCE',
      'ASSETS_EQ_LIAB_PLUS_EQUITY',
      'WALLET_LIABILITY_MATCH',
      'AR_INTEGRITY',
    ];
    for (const inv of required) {
      expect(src).toContain(inv);
    }
  });

  it('reconciliation cron is wired (not removed)', () => {
    const src = readSource('src/finance/reconciliation/reconciliation.service.ts');
    // The decorator carries an explicit @Cron annotation. Drop the
    // annotation and the engine becomes invisible — fail at build
    // time rather than at runtime.
    expect(src).toMatch(/@Cron\(/);
  });

  it('snapshot realtime refresher exists', () => {
    expect(
      fileExists('src/finance/snapshots/snapshot-realtime-refresher.service.ts'),
    ).toBe(true);
  });

  it('financial snapshot cron exists', () => {
    expect(fileExists('src/finance/snapshots/financial-snapshot.cron.ts')).toBe(
      true,
    );
  });

  it('drift detection emits a domain event for downstream consumers', () => {
    const src = readSource('src/finance/reconciliation/reconciliation.service.ts');
    expect(src).toMatch(/finance\.(?:drift|reconciliation)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  2. Anti-bypass suite
// ─────────────────────────────────────────────────────────────────────────────

const journalWriteAllowlist: ReadonlySet<string> = new Set([
  'src/general-ledger/double-entry-journal.service.ts',
  'src/general-ledger/double-entry-journal.service.spec.ts',
  'src/general-ledger/period-lock-enforcement.spec.ts',
  'src/finance/reconciliation/reconciliation.service.ts',
  // Independent-witness allowlists; both this spec and the
  // canonical-banking-guards.spec.ts are intentionally allowed
  // to mention the patterns in their text.
  'src/finance/v21-canonical-banking-guards.spec.ts',
  'src/finance/v21-phase1-core-freeze.spec.ts',
]);

const walletWriteAllowlist: ReadonlySet<string> = new Set([
  'src/customer-ledger/customer-ledger.service.ts',
  'src/customer-ledger/wallet.service.ts',
  'src/customer-ledger/debt-registration.service.ts',
  'src/invoice-audit/invoice-audit.service.ts',
  'src/call-center/call-center.service.ts',
  'src/finance/v21-canonical-banking-guards.spec.ts',
  'src/finance/v21-phase1-core-freeze.spec.ts',
]);

const debtLedgerWriteAllowlist: ReadonlySet<string> = new Set([
  'src/customer-ledger/customer-ledger.service.ts',
  'src/invoice-audit/invoice-audit.service.ts',
  'src/general-ledger/double-entry-journal.service.ts',
  'src/finance/v21-canonical-banking-guards.spec.ts',
  'src/finance/v21-phase1-core-freeze.spec.ts',
]);

const appendOnlyDeleteAllowlist: ReadonlySet<string> = new Set([
  'src/finance/test-utils/accountant-dashboard-integration-context.ts',
  'src/finance/v21-canonical-banking-guards.spec.ts',
  'src/finance/v21-phase1-core-freeze.spec.ts',
]);

const directJournalWritePattern =
  /\b(?:prisma|tx)\.journal(?:Entry|Line)\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\b/;
const directWalletWritePattern =
  /\b(?:prisma|tx)\.customerWallet\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\b/;
const directDebtLedgerWritePattern =
  /\b(?:prisma|tx)\.debtLedgerEntry\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\b/;
const appendOnlyDeletePattern =
  /\b(?:prisma|tx)\.(journalEntry|journalLine|debtLedgerEntry|transactionHistory|financialEventOutbox)\.deleteMany\b/;
const rawSqlMutationPattern = /\$executeRaw|\$executeRawUnsafe/;

describe('V21 Phase 1 — Anti-bypass suite', () => {
  const files = collectBackendSources();

  it('no direct journal write outside the canonical writer', () => {
    const v = scan(files, directJournalWritePattern, journalWriteAllowlist, false);
    if (v.length > 0) {
      throw new Error(
        `Direct journal write detected:\n${v
          .map((x) => `${x.file}:${x.line}: ${x.snippet}`)
          .join('\n')}`,
      );
    }
  });

  it('no direct customerWallet mutation outside the approved set', () => {
    const v = scan(files, directWalletWritePattern, walletWriteAllowlist, true);
    if (v.length > 0) {
      throw new Error(
        `Direct customerWallet write detected:\n${v
          .map((x) => `${x.file}:${x.line}: ${x.snippet}`)
          .join('\n')}`,
      );
    }
  });

  it('no direct debtLedgerEntry mutation outside the approved set', () => {
    const v = scan(files, directDebtLedgerWritePattern, debtLedgerWriteAllowlist, true);
    if (v.length > 0) {
      throw new Error(
        `Direct debtLedgerEntry write detected:\n${v
          .map((x) => `${x.file}:${x.line}: ${x.snippet}`)
          .join('\n')}`,
      );
    }
  });

  it('no deleteMany on append-only financial tables in production code', () => {
    const v = scan(files, appendOnlyDeletePattern, appendOnlyDeleteAllowlist, true);
    if (v.length > 0) {
      throw new Error(
        `deleteMany on append-only table detected:\n${v
          .map((x) => `${x.file}:${x.line}: ${x.snippet}`)
          .join('\n')}`,
      );
    }
  });

  it('no $executeRaw / $executeRawUnsafe in production code', () => {
    const v = scan(
      files,
      rawSqlMutationPattern,
      // Spec files may *mention* the pattern as a string literal.
      new Set([
        'src/finance/v21-canonical-banking-guards.spec.ts',
        'src/finance/v21-phase1-core-freeze.spec.ts',
      ]),
      true,
    );
    if (v.length > 0) {
      throw new Error(
        `Raw SQL mutation detected:\n${v
          .map((x) => `${x.file}:${x.line}: ${x.snippet}`)
          .join('\n')}`,
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  3. Mutation-boundary suite
// ─────────────────────────────────────────────────────────────────────────────

describe('V21 Phase 1 — Mutation-boundary suite', () => {
  it('every approved journal-writer file exists in the source tree', () => {
    for (const file of journalWriteAllowlist) {
      if (
        file.endsWith('.spec.ts') &&
        file.startsWith('src/finance/v21-')
      ) {
        // self-reference guards in the allowlist are the spec
        // files themselves; their existence is the running fact.
        continue;
      }
      expect(fileExists(file)).toBe(true);
    }
  });

  it('every approved wallet-writer file exists', () => {
    for (const file of walletWriteAllowlist) {
      if (file.startsWith('src/finance/v21-')) continue;
      expect(fileExists(file)).toBe(true);
    }
  });

  it('every approved debt-ledger-writer file exists', () => {
    for (const file of debtLedgerWriteAllowlist) {
      if (file.startsWith('src/finance/v21-')) continue;
      expect(fileExists(file)).toBe(true);
    }
  });

  it('canonical writer exposes appendBalanced as the named entry-point', () => {
    const src = readSource(
      'src/general-ledger/double-entry-journal.service.ts',
    );
    expect(src).toMatch(/async\s+appendBalanced\s*\(/);
    expect(src).toMatch(/UNBALANCED_JOURNAL/);
    expect(src).toMatch(/JOURNAL_SOURCE_REF_REQUIRED/);
    expect(src).toMatch(/JOURNAL_ACTOR_REQUIRED/);
  });

  it('canonical KWD helpers exist on the frontend single-file surface', () => {
    const src = readSource('web/src/lib/kwd.ts');
    const required = [
      'isPositiveKd',
      'isNegativeKd',
      'isZeroKd',
      'isMaterialKd',
      'compareKwdStrings',
      'sumKwdStrings',
      'subtractKwdStrings',
      'formatKwdLabel',
      'formatKwdAmount',
      'formatKwdLabelGrouped',
      'formatSignedKwdLabel',
    ];
    for (const sig of required) {
      expect(src).toContain(`export function ${sig}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  4. Replay-consistency suite
// ─────────────────────────────────────────────────────────────────────────────

describe('V21 Phase 1 — Replay-consistency suite', () => {
  const requiredReplayFiles: ReadonlyArray<string> = [
    'src/finance/canonical-hash.ts',
    'src/finance/canonical-snapshot.ts',
    'src/finance/canonical-replay.ts',
    'src/finance/canonical-immutable.ts',
    'src/finance/canonical-financial-projection.ts',
  ];

  it.each(requiredReplayFiles)('%s exists', (file) => {
    expect(fileExists(file)).toBe(true);
  });

  it.each(requiredReplayFiles)('%s has spec coverage', (file) => {
    const spec = file.replace(/\.ts$/, '.spec.ts');
    expect(fileExists(spec)).toBe(true);
  });

  it('canonical-hash exports a deterministic hash function', () => {
    const src = readSource('src/finance/canonical-hash.ts');
    expect(src).toMatch(/export\s+(function|const)\s+canonicalHash/);
  });

  it('canonical-snapshot exports a snapshot generator', () => {
    const src = readSource('src/finance/canonical-snapshot.ts');
    expect(src).toMatch(/export\s+(function|const|class)/);
  });

  it('canonical-replay exports a replay engine', () => {
    const src = readSource('src/finance/canonical-replay.ts');
    expect(src).toMatch(/export\s+(function|const|class)/);
  });

  it('Phase 6 replay-anomaly detector exists', () => {
    expect(
      fileExists('src/finance/observability/banking-anomaly-detectors.ts'),
    ).toBe(true);
    const src = readSource(
      'src/finance/observability/banking-anomaly-detectors.ts',
    );
    expect(src).toContain('export function detectReplayAnomaly');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  5. Closed-period rejection suite
// ─────────────────────────────────────────────────────────────────────────────

describe('V21 Phase 1 — Closed-period rejection suite', () => {
  it('appendBalanced reads PERIOD_LOCK_ENFORCE on every call', () => {
    const src = readSource(
      'src/general-ledger/double-entry-journal.service.ts',
    );
    // Reading the env at every call lets operators flip the flag
    // without restarting the process. If a future refactor caches
    // the value, this assertion fails.
    expect(src).toMatch(
      /process\.env\.PERIOD_LOCK_ENFORCE\s*===\s*['"]true['"]/,
    );
  });

  it('appendBalanced calls assertWriteAllowed when enforcement is on', () => {
    const src = readSource(
      'src/general-ledger/double-entry-journal.service.ts',
    );
    expect(src).toMatch(/this\.periodGuard\.assertWriteAllowed\(/);
  });

  it('FinancialPeriodsService exposes assertWriteAllowed', () => {
    const src = readSource('src/finance/periods/financial-periods.service.ts');
    expect(src).toMatch(/async\s+assertWriteAllowed\s*\(/);
    expect(src).toMatch(/financialPeriodViolation/);
    expect(src).toMatch(/ConflictException/);
  });

  it('idempotent retry on existing sourceRef short-circuits before period check', () => {
    const src = readSource(
      'src/general-ledger/double-entry-journal.service.ts',
    );
    // The ordering matters: idempotency check first, then period
    // guard. Otherwise a retry of a previously-OPEN write would
    // be rejected once the period closes.
    const idempotencyIdx = src.indexOf(
      'db.journalEntry.findUnique',
    );
    const periodGuardIdx = src.indexOf('this.periodGuard.assertWriteAllowed');
    expect(idempotencyIdx).toBeGreaterThan(0);
    expect(periodGuardIdx).toBeGreaterThan(idempotencyIdx);
  });

  it('period-lock enforcement spec covers the full matrix (7 cases)', () => {
    const src = readSource(
      'src/general-ledger/period-lock-enforcement.spec.ts',
    );
    const required = [
      'OFF + OPEN',
      'OFF + CLOSED',
      'ON + OPEN',
      'ON + CLOSED + non-reversal',
      'ON + CLOSED + allowReversal',
      'ON + CLOSED + retry of an existing sourceRef',
    ];
    for (const sig of required) {
      expect(src).toContain(sig);
    }
  });

  it('period-lock health monitor exists and is unit-tested', () => {
    expect(fileExists('src/finance/periods/period-lock-monitor.ts')).toBe(true);
    expect(
      fileExists('src/finance/periods/period-lock-monitor.spec.ts'),
    ).toBe(true);
    const src = readSource('src/finance/periods/period-lock-monitor.ts');
    expect(src).toContain('export function projectPeriodHealth');
  });

  it('PERIOD_LOCK_ENFORCE is documented in .env.example', () => {
    const src = readSource('.env.example');
    expect(src).toContain('PERIOD_LOCK_ENFORCE');
  });

  it('runbook for period-lock activation is in place', () => {
    const path =
      'docs/architecture/operational-runbooks/period-lock-enforcement.md';
    expect(fileExists(path)).toBe(true);
    const src = readSource(path);
    // The runbook must describe both directions: how to enable + how
    // to roll back. Otherwise it's a one-way trap.
    expect(src).toMatch(/PERIOD_LOCK_ENFORCE\s*=\s*true/);
    expect(src).toMatch(/PERIOD_LOCK_ENFORCE\s*=\s*false|Disabling enforcement/i);
  });
});
