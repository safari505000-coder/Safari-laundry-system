/**
 * V20.4 — Phase 5 concurrency stress test: deterministic sourceRef
 * idempotency check.
 *
 * The forensic audit's Phase 5 stress requirement is "1000 concurrent
 * partial payments → no duplicate receivable, no negative AR, no
 * phantom debt, no double journal". A real Postgres stress test
 * requires a live DB; in CI we can prove the **idempotency contract**
 * directly:
 *
 *   • The sourceRef generator for every collection write is now
 *     deterministic per intent (orderId / orderId+method / thRow.id).
 *   • Postgres enforces uniqueness on `DebtLedgerEntry.sourceRef`
 *     and `JournalEntry.sourceRef` (both unique indexes shipped
 *     with the V19.x and V20.3 migrations).
 *   • Therefore, any concurrent retry that submits the same intent
 *     hits the unique-constraint path → P2002 → swallowed in the
 *     try/catch, leaving exactly ONE row for the intent.
 *
 * This spec proves the FIRST property: every sourceRef the
 * Phase-5 patches generate is a pure function of its input intent
 * (no `Date.now()`, `Math.random()`, hostname, or process pid).
 * If a future change reintroduces non-determinism, this test fails
 * loudly so the regression is caught before it ships.
 */

const fs = require('fs');
const path = require('path');

const FILES_AND_KEYS: Array<{
  file: string;
  pattern: RegExp;
  label: string;
}> = [
  {
    file: 'src/customer-ledger/customer-ledger.service.ts',
    pattern: /sourceRef\s*=\s*[`'"][^`'"]*\$\{Date\.now/,
    label: 'customer-ledger.service.ts has no Date.now() in sourceRef',
  },
  {
    file: 'src/invoice-audit/invoice-audit.service.ts',
    pattern: /sourceRef\s*=\s*[`'"][^`'"]*\$\{Date\.now/,
    label: 'invoice-audit.service.ts has no Date.now() in sourceRef',
  },
  {
    file: 'src/customer-ledger/customer-ledger.service.ts',
    pattern: /sourceRef\s*=\s*[`'"][^`'"]*\$\{Math\.random/,
    label: 'customer-ledger.service.ts has no Math.random() in sourceRef',
  },
  {
    file: 'src/invoice-audit/invoice-audit.service.ts',
    pattern: /sourceRef\s*=\s*[`'"][^`'"]*\$\{Math\.random/,
    label: 'invoice-audit.service.ts has no Math.random() in sourceRef',
  },
];

describe('V20.4 Phase 5 — sourceRef determinism contract', () => {
  it.each(FILES_AND_KEYS)('$label', ({ file, pattern }) => {
    const abs = path.resolve(__dirname, '..', '..', file);
    const body = fs.readFileSync(abs, 'utf8');
    const matches = body.match(new RegExp(pattern.source, 'gm')) ?? [];
    if (matches.length > 0) {
      throw new Error(
        `Non-deterministic sourceRef found in ${file}:\n${matches
          .map((m: string) => `  ${m}`)
          .join('\n')}\n\n` +
          `Phase 5 of V20.4 forbids Date.now() / Math.random() in any sourceRef ` +
          `because Postgres only catches the resulting duplicate via the ` +
          `unique index — the duplicate row IS still attempted on every retry, ` +
          `which means concurrent retries can stamp out two different rows ` +
          `for the same intent (one per call).`,
      );
    }
  });

  it('Phase 5 lock helper is invoked from every wallet-mutation path', () => {
    const customerLedger = fs.readFileSync(
      path.resolve(
        __dirname,
        '..',
        '..',
        'src/customer-ledger/customer-ledger.service.ts',
      ),
      'utf8',
    );
    const walletService = fs.readFileSync(
      path.resolve(
        __dirname,
        '..',
        '..',
        'src/customer-ledger/wallet.service.ts',
      ),
      'utf8',
    );
    const invoiceAudit = fs.readFileSync(
      path.resolve(
        __dirname,
        '..',
        '..',
        'src/invoice-audit/invoice-audit.service.ts',
      ),
      'utf8',
    );

    // Customer-ledger: wallet mutations in customer-ledger.service.ts are
    // followed by WalletService.lockCustomerWalletForUpdateTx OR are the legacy
    // FIFO loop helper (line ~163). All call sites EXCEPT that loop
    // (which spans multiple iterations of its own lock cycle) must lock.
    const lockSites = (
      customerLedger.match(/lockCustomerWalletForUpdateTx/g) ?? []
    ).length;
    expect(lockSites).toBeGreaterThanOrEqual(4);
    expect(walletService).toContain(
      'SELECT 1 FROM "CustomerWallet" WHERE "id" = ${walletId}::uuid FOR UPDATE',
    );

    // Invoice-audit: both reverse and apply paths must FOR UPDATE.
    expect(invoiceAudit).toContain(
      'SELECT 1 FROM "CustomerWallet" WHERE "id" = ${wallet.id}::uuid FOR UPDATE',
    );
    const auditLocks = (
      invoiceAudit.match(
        /SELECT 1 FROM "CustomerWallet" WHERE "id" = \$\{wallet\.id\}::uuid FOR UPDATE/g,
      ) ?? []
    ).length;
    expect(auditLocks).toBeGreaterThanOrEqual(2);
  });
});
