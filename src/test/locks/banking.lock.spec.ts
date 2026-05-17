import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(repoRoot, p), 'utf8');

describe('Banking core lock', () => {
  it('keeps immediate PAYMENT_LINK receivable wired to Journal AR', () => {
    const orders = read('src/orders/orders.service.ts');
    const ledger = read('src/customer-ledger/customer-ledger.service.ts');

    expect(orders).toContain('isPaymentLinkImmediateDebtEnabled()');
    expect(orders).toContain('registerPendingPaymentLinkReceivableTx');
    expect(ledger).toContain(
      "const PAYMENT_LINK_RECEIVABLE_SOURCE = 'PAYMENT_LINK_RECEIVABLE'",
    );
    expect(ledger).toContain('paymentLinkReceivableSourceRef(orderId)');
    expect(ledger).toMatch(
      /accountCode:\s*JOURNAL_ACCOUNTS\.ACCOUNTS_RECEIVABLE,[\s\S]*debit:\s*amount/,
    );
    expect(ledger).toMatch(
      /accountCode:\s*JOURNAL_ACCOUNTS\.REVENUE,[\s\S]*credit:\s*amount/,
    );
    expect(ledger).toContain('this.journal.appendBalanced(tx');
  });

  it('keeps DEBT_ON_ACCOUNT invoice issuance journaled through the canonical writer', () => {
    const ledger = read('src/customer-ledger/customer-ledger.service.ts');

    expect(ledger).toContain('const isDebtOnAccount =');
    expect(ledger).toContain(
      'o.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT',
    );
    expect(ledger).toContain('const addInvoiceDebt =');
    expect(ledger).toContain('isDebtOnAccount ||');
    expect(ledger).toContain(
      'await this.journal.appendInvoiceIssuanceEntrySafe(tx',
    );
    expect(ledger).toContain('await this.journal.mirrorDebtLedgerEntrySafe(tx');
  });

  it('keeps appendBalanced enforcing debit equals credit before write', () => {
    const journal = read('src/general-ledger/double-entry-journal.service.ts');

    expect(journal).toContain('async appendBalanced');
    expect(journal).toContain('totalDebit = totalDebit.add(line.debit)');
    expect(journal).toContain('totalCredit = totalCredit.add(line.credit)');
    expect(journal).toMatch(
      /totalDebit\.sub\(totalCredit\)\.abs\(\)\.gt\(new Prisma\.Decimal\('0\.001'\)\)/,
    );
    expect(journal).toContain("throw new Error('UNBALANCED_JOURNAL')");
    expect(journal).toMatch(
      /return db\.journalEntry\.create\([\s\S]*lines:\s*{[\s\S]*create:/,
    );
  });

  it('keeps append-only guards for debt ledger and journal tables', () => {
    const prismaService = read('src/prisma/prisma.service.ts');
    const journalFoundation = read(
      'prisma/migrations/20260506160000_double_entry_journal_foundation/migration.sql',
    );
    const immutability = read(
      'prisma/migrations/20260507120000_v20_1_v4_journal_failure_and_immutability/migration.sql',
    );

    expect(prismaService).toContain(
      'DebtLedgerEntry append-only enforcement = DB trigger only',
    );
    expect(prismaService).toContain(
      'JournalEntry / JournalLine append-only enforcement = DB trigger + app-layer guard',
    );
    expect(journalFoundation).toContain(
      'CREATE OR REPLACE FUNCTION "Journal_append_only_guard"',
    );
    expect(immutability).toContain(
      'CREATE OR REPLACE FUNCTION "v20_v4_append_only_guard"',
    );
    for (const table of [
      'TransactionHistory',
      'JournalEntry',
      'JournalLine',
      'JournalFailureLog',
    ]) {
      expect(immutability).toContain(`"${table}_no_update"`);
      expect(immutability).toContain(`"${table}_no_delete"`);
      expect(immutability).toContain(`"${table}_no_truncate"`);
    }
  });
});
