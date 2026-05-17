import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');
const schema = readFileSync(join(repoRoot, 'prisma/schema.prisma'), 'utf8');
const immutability = readFileSync(
  join(
    repoRoot,
    'prisma/migrations/20260507120000_v20_1_v4_journal_failure_and_immutability/migration.sql',
  ),
  'utf8',
);

function modelBlock(name: string): string {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Missing Prisma model ${name}`);
  return match[1];
}

describe('Schema lock', () => {
  it('freezes critical financial table columns', () => {
    const critical: Record<string, string[]> = {
      Account: ['id', 'code', 'name', 'type', 'isActive', 'createdAt'],
      JournalEntry: [
        'id',
        'source',
        'sourceRef',
        'actorUserId',
        'customerId',
        'orderId',
        'branchId',
        'createdAt',
      ],
      JournalLine: ['id', 'entryId', 'accountId', 'debit', 'credit', 'meta'],
      JournalFailureLog: [
        'id',
        'customerId',
        'orderId',
        'source',
        'sourceRef',
        'amount',
        'errorCode',
        'errorMessage',
        'context',
        'createdAt',
      ],
      TransactionHistory: [
        'id',
        'type',
        'customerId',
        'orderId',
        'amount',
        'balanceBefore',
        'balanceAfter',
        'debtBefore',
        'debtAfter',
        'performedById',
        'metadata',
        'createdAt',
      ],
      CustomerWallet: ['id', 'customerId', 'balance', 'debt', 'updatedAt'],
      FinancialSnapshot: [
        'id',
        'customerId',
        'remainingDebtKd',
        'journalArBalanceKd',
      ],
    };

    for (const [model, columns] of Object.entries(critical)) {
      const block = modelBlock(model);
      for (const column of columns) {
        expect(block).toMatch(new RegExp(`\\b${column}\\b`));
      }
    }
  });

  it('keeps append-only trigger coverage for financial ledgers', () => {
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
