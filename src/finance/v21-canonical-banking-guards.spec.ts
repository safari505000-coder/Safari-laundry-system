import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..');

const guardedFiles = [
  'web/src/pages/pos-page.tsx',
  'web/src/pages/statement-print-page.tsx',
  'web/src/pages/unpaid-invoices-page.tsx',
  'web/src/pages/debt-recovery-report-page.tsx',
  'web/src/pages/commission-payouts-page.tsx',
  'web/src/pages/staff-debts-page.tsx',
  'web/src/modules/finance/components/CustomerFinancialHeader.tsx',
  'web/src/modules/finance/components/DebtCard.tsx',
  'web/src/modules/finance/components/MoneyFlowCard.tsx',
  'web/src/modules/call-center/dashboard/components/kpi-strip.tsx',
  'web/src/modules/call-center/dashboard/components/call-queue.tsx',
  'web/src/modules/call-center/control-tower/components/kpi-cards.tsx',
  'web/src/modules/call-center/control-tower/components/risk-table.tsx',
  'web/src/modules/call-center/dashboard/components/customer-panel.tsx',
  'web/src/modules/call-center/components/customer-ledger-panel.tsx',
  'web/src/modules/call-center/components/customer-360-panel.tsx',
  'web/src/modules/call-center/collections-report/pages/collections-report-page.tsx',
  'web/src/modules/call-center/pages/collections-page.tsx',
  'web/src/modules/collections/components/CollectionsQueuePanel.tsx',
  'web/src/modules/customers/components/Customer360Smart.tsx',
  'web/src/modules/driver/pages/driver-pending-invoices-page.tsx',
  'web/src/modules/driver/pages/my-deposits-page.tsx',
  'web/src/pages/cash-receipt-print-page.tsx',
  'web/src/pages/statement-print-page.tsx',
  'web/src/pages/loan-print-page.tsx',
  'web/src/pages/customer-statement-journal-page.tsx',
  'web/src/lib/arabic-customer-text.ts',
  'src/finance/canonical-money.ts',
  'src/finance/canonical-subscription.ts',
  'src/finance/canonical-invoice-status.ts',
  'src/finance/canonical-customer-financials.ts',
] as const;

const readonlyProjectionGuardedFiles = [
  'web/src/modules/finance/components/CustomerFinancialHeader.tsx',
  'web/src/modules/finance/components/DebtCard.tsx',
  'web/src/modules/finance/components/MoneyFlowCard.tsx',
  'web/src/modules/call-center/dashboard/components/kpi-strip.tsx',
  'web/src/modules/call-center/dashboard/components/call-queue.tsx',
  'web/src/modules/call-center/control-tower/components/kpi-cards.tsx',
  'web/src/modules/call-center/control-tower/components/risk-table.tsx',
  'web/src/modules/call-center/dashboard/components/customer-panel.tsx',
  'web/src/modules/call-center/components/customer-ledger-panel.tsx',
  'web/src/modules/call-center/components/customer-360-panel.tsx',
  'web/src/modules/call-center/collections-report/pages/collections-report-page.tsx',
  'web/src/modules/collections/components/CollectionsQueuePanel.tsx',
  'web/src/modules/customers/components/Customer360Smart.tsx',
  'web/src/pages/debt-recovery-report-page.tsx',
  'web/src/pages/commission-payouts-page.tsx',
  'web/src/modules/driver/pages/driver-pending-invoices-page.tsx',
  'web/src/pages/staff-debts-page.tsx',
  'web/src/pages/statement-print-page.tsx',
  'web/src/pages/loan-print-page.tsx',
  'web/src/pages/customer-statement-journal-page.tsx',
  'web/src/pages/debt-holds-page.tsx',
  'web/src/pages/debt-transfers-page.tsx',
  'web/src/modules/driver/pages/my-daily-sales-page.tsx',
  'web/src/modules/driver/pages/my-cash-receipts-page.tsx',
  'web/src/pages/reports-page.tsx',
  'web/src/pages/executive-dashboard-page.tsx',
  'web/src/pages/payslip-print-page.tsx',
  'web/src/pages/payroll-roster-print-page.tsx',
  'web/src/pages/monthly-summary-print-page.tsx',
  'web/src/pages/monthly-report-full-print-page.tsx',
] as const;

const collectionsReportGuardedFiles = [
  'web/src/modules/call-center/collections-report/pages/collections-report-page.tsx',
] as const;

/**
 * V21 Phase 3 — files that own canonical financial truth on the
 * backend. They must never reach for raw JS numeric coercion on KD
 * fields (Number(), unary +, parseFloat) because the canonical layer
 * speaks in decimal strings + Prisma.Decimal exclusively. Hidden
 * coercion would break deterministic hashing and replay equality.
 */
const decimalSafetyBackendFiles = [
  'src/finance/canonical-financial-projection.ts',
  'src/finance/canonical-customer-financials.ts',
  'src/finance/canonical-invoice-status.ts',
  'src/finance/canonical-subscription.ts',
  'src/finance/canonical-money.ts',
  'src/finance/canonical-hash.ts',
  'src/finance/canonical-snapshot.ts',
  'src/finance/canonical-immutable.ts',
  'src/finance/canonical-replay.ts',
] as const;

/**
 * V21 Phase 3 — print/export pages must consume the canonical
 * snapshot envelope only. They are forbidden from re-deriving any
 * financial value, so we hard-fail the build if they reintroduce
 * KD-side coercion or aggregation.
 */
const printSnapshotOnlyFiles = [
  'web/src/pages/statement-print-page.tsx',
  'web/src/pages/cash-receipt-print-page.tsx',
] as const;

/**
 * V21 Phase 4 — single canonical KWD formatter enforcement. The whole
 * frontend display layer must route money formatting through
 * `web/src/lib/kwd.ts`. These guarded files are the migrated display
 * surfaces; they must not redeclare a local `KWD_SUFFIX` constant or
 * a local `formatKwd*` helper. The single allowed canonical helpers
 * (`formatKwdLabel`, `formatKwdAmount`, `formatKwdLabelGrouped`,
 * `formatSignedKwdLabel`, `sumKwdStrings`, `subtractKwdStrings`) live
 * in `lib/kwd.ts` exclusively.
 *
 * POS / mutation surfaces (`pos-page.tsx`, `DriverPOS.tsx`,
 * `pos-auxiliary-ui.tsx`, `use-pos-engine.ts`, `finance-engine.ts`)
 * are intentionally excluded — Phase 4 is forbidden from touching
 * them per the operational constraint.
 */
const singleFormatterGuardedFiles = [
  'web/src/pages/statement-print-page.tsx',
  'web/src/pages/unpaid-invoices-page.tsx',
  'web/src/pages/debt-recovery-report-page.tsx',
  'web/src/pages/commission-payouts-page.tsx',
  'web/src/pages/staff-debts-page.tsx',
  'web/src/pages/cash-receipt-print-page.tsx',
  'web/src/modules/finance/components/CustomerFinancialHeader.tsx',
  'web/src/modules/finance/components/DebtCard.tsx',
  'web/src/modules/finance/components/MoneyFlowCard.tsx',
  'web/src/modules/call-center/pages/collections-page.tsx',
  'web/src/modules/call-center/dashboard/components/kpi-strip.tsx',
  'web/src/modules/call-center/dashboard/components/call-queue.tsx',
  'web/src/modules/call-center/control-tower/components/kpi-cards.tsx',
  'web/src/modules/call-center/control-tower/components/risk-table.tsx',
  'web/src/modules/call-center/dashboard/components/customer-panel.tsx',
  'web/src/modules/call-center/components/customer-ledger-panel.tsx',
  'web/src/modules/call-center/components/customer-360-panel.tsx',
  'web/src/modules/call-center/collections-report/pages/collections-report-page.tsx',
  'web/src/modules/collections/components/CollectionsQueuePanel.tsx',
  'web/src/modules/customers/components/Customer360Smart.tsx',
  'web/src/modules/driver/pages/driver-pending-invoices-page.tsx',
  'web/src/modules/driver/pages/my-deposits-page.tsx',
  'web/src/pages/loan-print-page.tsx',
  'web/src/pages/customer-statement-journal-page.tsx',
] as const;

const forbiddenPatterns: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'inline KWD toFixed(3) formatting',
    pattern: /\.toFixed\(3\)/,
  },
  {
    name: 'duplicate inline Intl.NumberFormat money formatter',
    pattern: /new\s+Intl\.NumberFormat\([^)]*(?:KWD|ar-KW|en-GB)/,
  },
  {
    name: 'manual Arabic KWD suffix concatenation',
    pattern: /[`'"][^`'"]*د\.ك[^`'"]*[`'"]/,
  },
];

const forbiddenReadonlyMathPatterns: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'parseFloat on KD display data',
    pattern: /(?:Number\.)?parseFloat\s*\([^)]*Kd\b/,
  },
  {
    name: 'local reduce over KD display data',
    pattern: /\.reduce\s*\([^)]*Kd\b/,
  },
  {
    name: 'legacy customer ledger debt parser',
    pattern: /parseLedgerOperationalDebtKd\s*\(/,
  },
  {
    name: 'legacy formatArabicKwd duplicate formatter',
    pattern: /\bformatArabicKwd\s*\(/,
  },
  {
    name: 'local statement debt reconstruction',
    pattern: /Math\.max\s*\(\s*-.*balanceAfter/i,
  },
  {
    name: 'local closed invoice total reconstruction',
    pattern: /closedInvoices\.reduce\s*\(/,
  },
  {
    name: 'local net financial arithmetic',
    pattern: /const\s+\w*net\w*\s*=\s*[^;\n]*(?:Kd|cashIn|cashOut)[^;\n]*[-+][^;\n]*(?:Kd|cashIn|cashOut)/i,
  },
];

const forbiddenCollectionsReportPatterns: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'local unpaid-online branch grouping',
    pattern: /groupUnpaidByBranch\s*\(/,
  },
  {
    name: 'local unpaid-online payment-link filtering',
    pattern: /filterUnpaidLinks\s*\(/,
  },
];

/**
 * V21 Phase 3 — patterns that break decimal safety on the backend
 * canonical layer. KD values must always flow as decimal strings or
 * Prisma.Decimal; raw JS coercion silently drifts at the 4th decimal.
 */
const forbiddenDecimalSafetyPatterns: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'Number() coercion on KD field',
    pattern: /\bNumber\s*\([^)]*Kd\b/,
  },
  {
    name: 'unary + coercion on KD field',
    pattern: /\+\s*[A-Za-z_$][\w$]*Kd\b/,
  },
  {
    name: 'parseFloat on KD field',
    pattern: /(?:Number\.)?parseFloat\s*\([^)]*Kd\b/,
  },
];

/**
 * V21 Phase 4 — patterns that prove a display surface is re-creating a
 * parallel money-formatting layer instead of routing through the
 * canonical `lib/kwd.ts` helpers.
 *
 * NOTE: a thin null-safe wrapper that returns `formatKwdLabel(value)`
 * for non-null inputs is acceptable — it routes through the canonical
 * helper and does not redefine the formatting standard. The only true
 * duplication signal we catch here is a local `KWD_SUFFIX` constant,
 * which is what `lib/kwd.ts` owns and which previously appeared
 * verbatim in `collections-page.tsx`.
 */
const forbiddenSingleFormatterPatterns: Array<{
  name: string;
  pattern: RegExp;
}> = [
  {
    name: 'local KWD_SUFFIX constant duplicating lib/kwd.ts',
    pattern: /\bconst\s+KWD_SUFFIX\s*=/,
  },
];

/**
 * V21 Phase 3 — patterns that prove a print/export page is
 * reconstructing financial truth instead of consuming the canonical
 * snapshot envelope.
 */
const forbiddenPrintReconstructionPatterns: Array<{
  name: string;
  pattern: RegExp;
}> = [
  {
    name: 'parseFloat on KD field inside print page',
    pattern: /(?:Number\.)?parseFloat\s*\([^)]*Kd\b/,
  },
  {
    name: 'Number() coercion on KD field inside print page',
    pattern: /\bNumber\s*\([^)]*Kd\b/,
  },
  {
    name: 'reduce over KD field inside print page',
    pattern: /\.reduce\s*\([^)]*Kd\b/,
  },
  {
    name: 'closedInvoices reconstruction inside print page',
    pattern: /closedInvoices\.reduce\s*\(/,
  },
  {
    name: 'effective debt reconstruction inside print page',
    pattern: /Math\.max\s*\(\s*-.*balanceAfter/i,
  },
];

/**
 * V21 Phase 2 — Canonical Financial Enforcement.
 *
 * Build-time invariants that lock the system to a single financial
 * source of truth: the canonical journal. Any future PR that
 * re-introduces a parallel writer or a hidden coupling to a non-
 * canonical layer will fail this guard at CI.
 */

/** Files that are ALLOWED to call `prisma.journalEntry.*` /
 * `prisma.journalLine.*` / `tx.journalEntry.*` / `tx.journalLine.*`.
 * The canonical writer + its tests + the period-lock enforcement
 * spec. Nobody else may touch the journal table directly. */
const journalWriteAllowlist: ReadonlySet<string> = new Set([
  'src/general-ledger/double-entry-journal.service.ts',
  'src/general-ledger/double-entry-journal.service.spec.ts',
  'src/general-ledger/period-lock-enforcement.spec.ts',
  // Reconciliation service reads journal totals; it must never write,
  // but it owns the invariant assertions, so allow Read APIs only.
  'src/finance/reconciliation/reconciliation.service.ts',
]);

const directJournalWritePattern =
  /\b(?:prisma|tx)\.journal(?:Entry|Line)\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\b/;

/**
 * V21 Phase 3 — Hard Financial Write Isolation.
 *
 * `customerWallet.update|upsert|create` and
 * `debtLedgerEntry.create|createMany|update|updateMany` are the
 * canonical state mutations of the AR + wallet liability ledger.
 * They are restricted to a closed set of services. Any new file
 * outside this allowlist will fail the build.
 */
const walletWriteAllowlist: ReadonlySet<string> = new Set([
  // Canonical orchestrator
  'src/customer-ledger/customer-ledger.service.ts',
  // Phase 1 split: wallet row creation/locking helper used only by the canonical orchestrator.
  'src/customer-ledger/wallet.service.ts',
  // Phase 2 split: payment-link receivable debt write paired with Journal AR.
  'src/customer-ledger/debt-registration.service.ts',
  // Reversal-only — paired with appendBalanced
  'src/invoice-audit/invoice-audit.service.ts',
  // Subscription expiry (non-financial mutation; reminder counter)
  'src/call-center/call-center.service.ts',
]);
const debtLedgerWriteAllowlist: ReadonlySet<string> = new Set([
  'src/customer-ledger/customer-ledger.service.ts',
  'src/invoice-audit/invoice-audit.service.ts',
  // mirrorDebtLedgerEntrySafe is the canonical mirror-write helper
  'src/general-ledger/double-entry-journal.service.ts',
]);
const directWalletWritePattern =
  /\b(?:prisma|tx)\.customerWallet\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\b/;
const directDebtLedgerWritePattern =
  /\b(?:prisma|tx)\.debtLedgerEntry\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\b/;
/** `deleteMany` on append-only financial tables is *never* allowed
 * outside test fixtures. Even the canonical writer must not delete
 * rows from these tables (corrections happen via reversal entries). */
const appendOnlyDeletePattern =
  /\b(?:prisma|tx)\.(journalEntry|journalLine|debtLedgerEntry|transactionHistory|financialEventOutbox)\.deleteMany\b/;
const appendOnlyDeleteAllowlist: ReadonlySet<string> = new Set([
  // Test fixtures only
  'src/finance/test-utils/accountant-dashboard-integration-context.ts',
]);

const testInfrastructurePrefixes = [
  'src/test/setup/',
  'src/test/factories/',
  'src/test/helpers/',
  'src/test/financial/',
] as const;

function isTestInfrastructureFile(rel: string): boolean {
  return testInfrastructurePrefixes.some((prefix) => rel.startsWith(prefix));
}

/** Frontend money-comparison guard. Any source file living under
 * `web/src/` (excluding the canonical kwd.ts file itself) that uses
 * `Number.parseFloat(...Kd...) < 0` style comparisons re-introduces
 * native float math on money. The canonical answer is the helpers
 * `isNegativeKd`, `isPositiveKd`, `isZeroKd`, `compareKwdStrings`
 * exported from `web/src/lib/kwd.ts`. */
const moneyComparisonViolationPattern =
  /(?:Number\.)?parseFloat\s*\([^)]*Kd[^)]*\)\s*[<>!=]+/;

/** A handful of legacy files still need to be migrated; they are
 * tracked here so the guard fires only on **new** violations. Each
 * entry is a deliberate exception with a Phase-7 cleanup ticket.
 * V21 Phase 7 cleared `financials-page.tsx`, so the allowlist is
 * currently empty — every guarded file is held to the strict rule. */
const moneyComparisonLegacyAllowlist: ReadonlySet<string> = new Set([]);

/** Files we want to enforce the comparison guard on. We grow this
 * set incrementally — every newly migrated page or component should
 * be added here so it locks in. The empty case is handled gracefully
 * (i.e., no `it.each` test is scheduled). */
const moneyComparisonGuardedFiles: ReadonlyArray<string> = [
  'web/src/modules/finance/components/CustomerFinancialHeader.tsx',
  'web/src/modules/finance/components/DebtCard.tsx',
  'web/src/modules/finance/components/MoneyFlowCard.tsx',
  'web/src/pages/loan-print-page.tsx',
  'web/src/pages/payslip-print-page.tsx',
  'web/src/pages/customer-statement-journal-page.tsx',
  'web/src/pages/cash-receipt-print-page.tsx',
  'web/src/pages/statement-print-page.tsx',
  // V21 Phase 7 — financials-page.tsx migrated to isNegativeKd
  'web/src/pages/financials-page.tsx',
  // V21 Phase 1 (Core Freeze) — additional migrations to the
  // canonical isPositiveKd / isMaterialKd / formatKwdAmount helpers
  'web/src/modules/call-center/dashboard/components/tabs/overview-tab.tsx',
  'web/src/modules/shared/lib/whatsapp-links.ts',
  'web/src/pages/payroll-page.tsx',
  'web/src/pages/unpaid-invoices-page.tsx',
  'web/src/pages/feedback-inbox-page.tsx',
];

describe('V21 canonical banking guards', () => {
  it.each(guardedFiles)('%s does not reintroduce local money formatting', (file) => {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    const violations: string[] = [];
    for (const rule of forbiddenPatterns) {
      if (rule.pattern.test(source)) {
        violations.push(`${file}: ${rule.name}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it.each(readonlyProjectionGuardedFiles)('%s does not reintroduce readonly financial display math', (file) => {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    const violations: string[] = [];
    for (const rule of forbiddenReadonlyMathPatterns) {
      if (rule.pattern.test(source)) {
        violations.push(`${file}: ${rule.name}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it.each(collectionsReportGuardedFiles)('%s reads unpaid-online report projections from backend', (file) => {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    const violations: string[] = [];
    for (const rule of forbiddenCollectionsReportPatterns) {
      if (rule.pattern.test(source)) {
        violations.push(`${file}: ${rule.name}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it.each(decimalSafetyBackendFiles)(
    '%s preserves decimal safety (no JS numeric coercion on KD fields)',
    (file) => {
      const source = readFileSync(join(repoRoot, file), 'utf8');
      const violations: string[] = [];
      for (const rule of forbiddenDecimalSafetyPatterns) {
        if (rule.pattern.test(source)) {
          violations.push(`${file}: ${rule.name}`);
        }
      }
      expect(violations).toEqual([]);
    },
  );

  it.each(printSnapshotOnlyFiles)(
    '%s consumes the canonical snapshot envelope only (no financial reconstruction)',
    (file) => {
      const source = readFileSync(join(repoRoot, file), 'utf8');
      const violations: string[] = [];
      for (const rule of forbiddenPrintReconstructionPatterns) {
        if (rule.pattern.test(source)) {
          violations.push(`${file}: ${rule.name}`);
        }
      }
      expect(violations).toEqual([]);
    },
  );

  it.each(singleFormatterGuardedFiles)(
    '%s routes KWD formatting through the single canonical lib/kwd.ts helpers',
    (file) => {
      const source = readFileSync(join(repoRoot, file), 'utf8');
      const violations: string[] = [];
      for (const rule of forbiddenSingleFormatterPatterns) {
        if (rule.pattern.test(source)) {
          violations.push(`${file}: ${rule.name}`);
        }
      }
      expect(violations).toEqual([]);
    },
  );

  /**
   * Walk `src/` once and collect every `.ts` (non-`.d.ts`, non-`.spec.ts`
   * left out only when the rule excludes them) file. Cached per-test
   * because `walk` is identical across rules.
   */
  function collectBackendSources(): Array<{ rel: string; lines: string[] }> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
    const out: Array<{ rel: string; lines: string[] }> = [];
    function walk(dir: string): void {
      for (const entry of readdirSync(dir)) {
        const abs = join(dir, entry);
        const stat = statSync(abs);
        if (stat.isDirectory()) {
          if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
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
    files: Array<{ rel: string; lines: string[] }>,
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

  /**
   * V21 Phase 2 invariant — `appendBalanced` is the sole journal
   * writer in production code. We walk every backend `.ts` file and
   * fail if a non-allowlisted file calls `prisma.journalEntry.*` /
   * `prisma.journalLine.*` / `tx.journalEntry.*` / `tx.journalLine.*`
   * with any mutating verb (create / update / delete / upsert / *Many).
   *
   * This is the *structural* version of the rule already enforced in
   * code review — a future PR cannot accidentally bypass `appendBalanced`
   * because the test will fail at build time.
   */
  it('canonical writer is the only journal mutator in production code', () => {
    const violations = scan(
      collectBackendSources(),
      directJournalWritePattern,
      journalWriteAllowlist,
      false,
    );
    if (violations.length > 0) {
      const formatted = violations
        .map((v) => `${v.file}:${v.line}: ${v.snippet}`)
        .join('\n');
      throw new Error(
        `V21 Phase 2 — direct journal write detected. ` +
          `All journal mutations must go through ` +
          `DoubleEntryJournalService.appendBalanced.\n${formatted}`,
      );
    }
  });

  /**
   * V21 Phase 3 — `customerWallet` mutating writes are restricted to
   * the canonical orchestrator + invoice-audit reversal + non-financial
   * call-center counters. Any new file appearing in this set is
   * automatically flagged and must be either added to the allowlist
   * (and reviewed for canonical compliance) or rewritten to flow
   * through the canonical orchestrator.
   */
  it('customerWallet mutators are restricted to the canonical writer set', () => {
    const violations = scan(
      collectBackendSources(),
      directWalletWritePattern,
      walletWriteAllowlist,
      true,
    );
    if (violations.length > 0) {
      const formatted = violations
        .map((v) => `${v.file}:${v.line}: ${v.snippet}`)
        .join('\n');
      throw new Error(
        `V21 Phase 3 — direct customerWallet write detected outside the ` +
          `approved writer set. Add the file to walletWriteAllowlist only ` +
          `after confirming it is paired with a canonical journal entry.\n${formatted}`,
      );
    }
  });

  /**
   * V21 Phase 3 — `debtLedgerEntry` mutating writes are restricted
   * to the canonical orchestrator + invoice-audit + the journal
   * mirror helper. Same enforcement model as wallet writes.
   */
  it('debtLedgerEntry mutators are restricted to the canonical writer set', () => {
    const violations = scan(
      collectBackendSources(),
      directDebtLedgerWritePattern,
      debtLedgerWriteAllowlist,
      true,
    );
    if (violations.length > 0) {
      const formatted = violations
        .map((v) => `${v.file}:${v.line}: ${v.snippet}`)
        .join('\n');
      throw new Error(
        `V21 Phase 3 — direct debtLedgerEntry write detected outside the ` +
          `approved writer set.\n${formatted}`,
      );
    }
  });

  /**
   * V21 Phase 3 — append-only financial tables (journalEntry,
   * journalLine, debtLedgerEntry, transactionHistory,
   * financialEventOutbox) must NEVER be `deleteMany`-ed in production
   * code. Corrections happen via reversal entries, never by deletion.
   * Test fixtures are explicitly allowlisted.
   */
  it('append-only financial tables are never deleteMany-ed in production code', () => {
    const violations = scan(
      collectBackendSources(),
      appendOnlyDeletePattern,
      appendOnlyDeleteAllowlist,
      true,
    );
    if (violations.length > 0) {
      const formatted = violations
        .map((v) => `${v.file}:${v.line}: ${v.snippet}`)
        .join('\n');
      throw new Error(
        `V21 Phase 3 — deleteMany on append-only financial table detected. ` +
          `Append-only tables forbid deletion; use a reversal entry instead.\n${formatted}`,
      );
    }
  });

  /**
   * V21 Phase 2 + Phase 1 (Core Freeze) invariant — the canonical
   * KWD comparison helpers exist and are exported from the single
   * canonical money-formatter file. If they disappear, every
   * migration that depends on them silently falls back to
   * `Number.parseFloat` and that drift would be undetectable in
   * code review.
   */
  it('canonical KWD comparison helpers exist in lib/kwd.ts', () => {
    const source = readFileSync(join(repoRoot, 'web/src/lib/kwd.ts'), 'utf8');
    const required = [
      'export function isPositiveKd',
      'export function isNegativeKd',
      'export function isZeroKd',
      'export function compareKwdStrings',
      'export function isMaterialKd',
    ];
    const missing = required.filter((sig) => !source.includes(sig));
    expect(missing).toEqual([]);
  });

  if (moneyComparisonGuardedFiles.length > 0) {
    it.each(moneyComparisonGuardedFiles)(
      '%s does not compare money via parseFloat (use isNegativeKd/isPositiveKd/compareKwdStrings)',
      (file) => {
        if (moneyComparisonLegacyAllowlist.has(file)) {
          // Legacy file — Phase 7 migration target. Skipped to keep
          // the build green while we work the backlog. The Phase-1
          // audit lists it explicitly.
          return;
        }
        const source = readFileSync(join(repoRoot, file), 'utf8');
        if (moneyComparisonViolationPattern.test(source)) {
          throw new Error(
            `${file} compares a *Kd field with native float math. ` +
              `Use isNegativeKd / isPositiveKd / isZeroKd / ` +
              `compareKwdStrings from web/src/lib/kwd.ts instead.`,
          );
        }
      },
    );
  }
});
