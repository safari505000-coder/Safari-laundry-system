import { Prisma } from '@prisma/client';
import { FinancialIntegrityService } from './financial-integrity.service';
import { FinancialIntegrityError } from './financial-integrity.errors';

function makeService(existingEntry: { id: string } | null = null) {
  const findUnique = jest.fn().mockResolvedValue(existingEntry);
  const prisma = { journalEntry: { findUnique } } as never;
  return {
    service: new FinancialIntegrityService(prisma),
    db: { journalEntry: { findUnique } } as never,
    findUnique,
  };
}

describe('FinancialIntegrityService — guard', () => {
  describe('assertEntryBalanced', () => {
    const { service } = makeService();

    it('accepts a balanced two-line entry', () => {
      expect(() =>
        service.assertEntryBalanced([
          { accountCode: '1100', debit: '5.0000' },
          { accountCode: '1300', credit: '5.0000' },
        ]),
      ).not.toThrow();
    });

    it('rejects debit != credit (UNBALANCED_ENTRY)', () => {
      try {
        service.assertEntryBalanced([
          { accountCode: '1100', debit: '5.0000' },
          { accountCode: '1300', credit: '4.0000' },
        ]);
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(FinancialIntegrityError);
        expect((err as FinancialIntegrityError).code).toBe('UNBALANCED_ENTRY');
      }
    });

    it('rejects a negative line (NEGATIVE_LINE)', () => {
      expect(() =>
        service.assertEntryBalanced([
          { accountCode: '1100', debit: '-5.0000' },
          { accountCode: '1300', credit: '-5.0000' },
        ]),
      ).toThrow(FinancialIntegrityError);
    });

    it('rejects an ambiguous line (AMBIGUOUS_LINE)', () => {
      try {
        service.assertEntryBalanced([
          { accountCode: '1100', debit: '5.0000', credit: '5.0000' },
          { accountCode: '1300', credit: '5.0000' },
        ]);
        fail('expected throw');
      } catch (err) {
        expect((err as FinancialIntegrityError).code).toBe('AMBIGUOUS_LINE');
      }
    });

    it('rejects fewer than two lines (MINIMUM_TWO_LINES)', () => {
      try {
        service.assertEntryBalanced([{ accountCode: '1100', debit: '5.0000' }]);
        fail('expected throw');
      } catch (err) {
        expect((err as FinancialIntegrityError).code).toBe('MINIMUM_TWO_LINES');
      }
    });

    it('rejects an empty line (EMPTY_LINE)', () => {
      try {
        service.assertEntryBalanced([
          { accountCode: '1100' },
          { accountCode: '1300' },
        ]);
        fail('expected throw');
      } catch (err) {
        expect((err as FinancialIntegrityError).code).toBe('EMPTY_LINE');
      }
    });

    it('tolerates sub-fils rounding within ±0.001', () => {
      expect(() =>
        service.assertEntryBalanced([
          { accountCode: '1100', debit: '5.0005' },
          { accountCode: '1300', credit: '5.0000' },
        ]),
      ).not.toThrow();
    });
  });

  describe('duplicate / double-settlement / double-reversal', () => {
    it('assertNoDuplicatePosting throws DUPLICATE_POSTING when an entry exists', async () => {
      const { service, db } = makeService({ id: 'existing' });
      await expect(service.assertNoDuplicatePosting(db, 'ref:1')).rejects.toMatchObject({
        code: 'DUPLICATE_POSTING',
      });
    });

    it('assertNoDuplicatePosting passes when no entry exists', async () => {
      const { service, db } = makeService(null);
      await expect(service.assertNoDuplicatePosting(db, 'ref:1')).resolves.toBeUndefined();
    });

    it('assertNotAlreadySettled throws DOUBLE_SETTLEMENT on existing settlement', async () => {
      const { service, db } = makeService({ id: 'paid' });
      await expect(
        service.assertNotAlreadySettled(db, 'JOURNAL:EXTERNAL_PAYMENT:o1:CASH'),
      ).rejects.toMatchObject({ code: 'DOUBLE_SETTLEMENT' });
    });

    it('assertNotAlreadyReversed throws DOUBLE_REVERSAL on existing reversal', async () => {
      const { service, db } = makeService({ id: 'rev' });
      await expect(
        service.assertNotAlreadyReversed(db, 'JOURNAL:INVOICE_CANCELED:o1'),
      ).rejects.toMatchObject({ code: 'DOUBLE_REVERSAL' });
    });
  });

  describe('assertNonNegativeBalance', () => {
    const { service } = makeService();

    it('passes for a non-negative balance', () => {
      expect(() => service.assertNonNegativeBalance(new Prisma.Decimal('0.0000'))).not.toThrow();
    });

    it('throws NEGATIVE_BALANCE for an invalid negative balance', () => {
      try {
        service.assertNonNegativeBalance('-1.0000', { customerId: 'c1' });
        fail('expected throw');
      } catch (err) {
        expect((err as FinancialIntegrityError).code).toBe('NEGATIVE_BALANCE');
      }
    });
  });
});
