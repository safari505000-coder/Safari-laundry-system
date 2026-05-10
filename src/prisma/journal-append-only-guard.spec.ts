import { ForbiddenException } from '@nestjs/common';
import { guardJournalDelegate } from './prisma.service';

/**
 * V20.4 — Phase 3 journal-append-only application-layer guard test.
 *
 * The DB trigger `Journal_append_only_guard` (shipped in
 * 20260506160000_double_entry_journal_foundation) is the ultimate
 * enforcement. This unit test pins the application-layer Proxy
 * guard so the contract is regression-protected:
 *
 *   • All read verbs flow through unchanged (findMany, findUnique,
 *     findFirst, count, aggregate, ...).
 *   • The two append verbs (create, createMany) flow through.
 *   • Every mutating verb (update, updateMany, delete, deleteMany,
 *     upsert) throws ForbiddenException with the canonical
 *     `JOURNAL_APPEND_ONLY_VIOLATION` prefix.
 */
describe('guardJournalDelegate (V20.4 Phase 3)', () => {
  function makeFakeDelegate() {
    return {
      findMany: jest.fn().mockResolvedValue(['ok']),
      findUnique: jest.fn().mockResolvedValue({ id: 'x' }),
      findFirst: jest.fn().mockResolvedValue({ id: 'x' }),
      count: jest.fn().mockResolvedValue(1),
      aggregate: jest.fn().mockResolvedValue({ _sum: null }),
      create: jest.fn().mockResolvedValue({ id: 'new' }),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      update: jest.fn().mockResolvedValue({ id: 'x' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete: jest.fn().mockResolvedValue({ id: 'x' }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn().mockResolvedValue({ id: 'x' }),
    };
  }

  it('passes through every read verb', async () => {
    const fake = makeFakeDelegate();
    const guarded = guardJournalDelegate(fake, 'JournalEntry');

    expect(await guarded.findMany()).toEqual(['ok']);
    expect(await guarded.findUnique()).toEqual({ id: 'x' });
    expect(await guarded.findFirst()).toEqual({ id: 'x' });
    expect(await guarded.count()).toBe(1);
    expect(await guarded.aggregate()).toEqual({ _sum: null });
  });

  it('passes through create and createMany (append verbs are allowed)', async () => {
    const fake = makeFakeDelegate();
    const guarded = guardJournalDelegate(fake, 'JournalEntry');

    expect(await guarded.create()).toEqual({ id: 'new' });
    expect(await guarded.createMany()).toEqual({ count: 2 });
  });

  it.each(['update', 'updateMany', 'delete', 'deleteMany', 'upsert'] as const)(
    'throws ForbiddenException on %s',
    (verb) => {
      const fake = makeFakeDelegate();
      const guarded = guardJournalDelegate(fake, 'JournalEntry') as Record<
        string,
        () => unknown
      >;

      expect(() => guarded[verb]()).toThrow(ForbiddenException);
      try {
        guarded[verb]();
      } catch (err) {
        expect((err as Error).message).toContain('JOURNAL_APPEND_ONLY_VIOLATION');
        expect((err as Error).message).toContain(`JournalEntry.${verb}`);
      }
    },
  );

  it('uses the supplied label in the error message', () => {
    const fake = makeFakeDelegate();
    const guarded = guardJournalDelegate(fake, 'JournalLine') as Record<
      string,
      () => unknown
    >;

    try {
      guarded.update();
      throw new Error('should not reach here');
    } catch (err) {
      expect((err as Error).message).toContain('JournalLine.update is forbidden');
      expect((err as Error).message).toContain(
        'Use a reversal entry via DoubleEntryJournalService',
      );
    }
  });
});
