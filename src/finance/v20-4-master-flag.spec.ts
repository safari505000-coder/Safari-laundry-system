import {
  isJournalAsSourceEnabled,
  isV20_3TrueAccountingEnabled,
  isV20_4FinalLedgerEnabled,
} from './debt-customer-aggregates.util';

/**
 * V20.4 — Phase 7 master-flag contract tests.
 *
 * Proves that flipping `V20_4_FINAL_LEDGER=true` is sufficient to
 * unconditionally force both `V20_3_TRUE_ACCOUNTING` and
 * `USE_JOURNAL_AS_SOURCE` ON, regardless of their explicit env
 * values. This is the "single switch" the operator flips after
 * the reconciliation engine reports `driftCount=0`.
 *
 * We never want a future refactor to silently dilute that
 * guarantee — the spec pins the precedence.
 */
describe('V20.4 master flag (Phase 7)', () => {
  const original = {
    master: process.env.V20_4_FINAL_LEDGER,
    v203: process.env.V20_3_TRUE_ACCOUNTING,
    journal: process.env.USE_JOURNAL_AS_SOURCE,
  };

  afterEach(() => {
    process.env.V20_4_FINAL_LEDGER = original.master;
    process.env.V20_3_TRUE_ACCOUNTING = original.v203;
    process.env.USE_JOURNAL_AS_SOURCE = original.journal;
  });

  it('isV20_4FinalLedgerEnabled accepts true / 1 / on / yes', () => {
    for (const v of ['true', '1', 'on', 'yes', 'TRUE', 'On']) {
      process.env.V20_4_FINAL_LEDGER = v;
      expect(isV20_4FinalLedgerEnabled()).toBe(true);
    }
    process.env.V20_4_FINAL_LEDGER = 'false';
    expect(isV20_4FinalLedgerEnabled()).toBe(false);
    delete process.env.V20_4_FINAL_LEDGER;
    expect(isV20_4FinalLedgerEnabled()).toBe(false);
  });

  it('master flag forces V20_3_TRUE_ACCOUNTING on even when explicitly off', () => {
    process.env.V20_4_FINAL_LEDGER = 'true';
    process.env.V20_3_TRUE_ACCOUNTING = 'false';
    expect(isV20_3TrueAccountingEnabled()).toBe(true);
  });

  it('master flag forces USE_JOURNAL_AS_SOURCE on even when explicitly off', () => {
    process.env.V20_4_FINAL_LEDGER = 'true';
    process.env.USE_JOURNAL_AS_SOURCE = 'false';
    expect(isJournalAsSourceEnabled()).toBe(true);
  });

  it('master flag OFF restores per-feature evaluation', () => {
    process.env.V20_4_FINAL_LEDGER = 'false';
    process.env.V20_3_TRUE_ACCOUNTING = 'true';
    process.env.USE_JOURNAL_AS_SOURCE = 'false';
    expect(isV20_3TrueAccountingEnabled()).toBe(true);
    expect(isJournalAsSourceEnabled()).toBe(false);

    process.env.V20_3_TRUE_ACCOUNTING = 'false';
    expect(isV20_3TrueAccountingEnabled()).toBe(false);
  });
});
