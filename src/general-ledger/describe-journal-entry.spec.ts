import { describeJournalEntry } from './double-entry-journal.service';

describe('V21 Phase 5 — describeJournalEntry canonical statement formatter', () => {
  it('renders an Arabic invoice description for ORDER_INVOICE', () => {
    expect(describeJournalEntry('ORDER_INVOICE', 'ORDER:abc123')).toContain(
      'فاتورة',
    );
  });

  it('detects payment method from sourceRef tokens', () => {
    expect(
      describeJournalEntry('PAYMENT', 'PAYMENT:CASH:trace-1'),
    ).toContain('كاش');
    expect(
      describeJournalEntry('PAYMENT', 'PAYMENT:KNET:trace-2'),
    ).toContain('كي');
    expect(
      describeJournalEntry('PAYMENT', 'PAYMENT:ONLINE:trace-3'),
    ).toContain('أونلاين');
    expect(
      describeJournalEntry('PAYMENT', 'PAYMENT:PAYMENT_LINK:trace-4'),
    ).toContain('رابط دفع');
  });

  it('falls back to a generic Arabic label for an unknown payment method', () => {
    expect(describeJournalEntry('PAYMENT', 'PAYMENT:OTHER:zzz')).toContain(
      'تسديد',
    );
  });

  it('describes wallet absorption / settlement as subscription debit', () => {
    expect(
      describeJournalEntry('WALLET_ABSORPTION', 'ORDER:abc'),
    ).toContain('رصيد الاشتراك');
    expect(
      describeJournalEntry('WALLET_SETTLEMENT', 'ORDER:abc'),
    ).toContain('رصيد الاشتراك');
  });

  it('describes subscription lifecycle entries', () => {
    expect(
      describeJournalEntry('SUBSCRIPTION_ACTIVATION', 'SUB:abc'),
    ).toContain('تفعيل اشتراك');
    expect(
      describeJournalEntry('SUBSCRIPTION_CANCELLATION', 'SUB:abc'),
    ).toContain('إلغاء اشتراك');
  });

  it('describes adjustments, reversals, edits, voids', () => {
    expect(describeJournalEntry('DEBT_ADJUSTMENT', 'ADJUSTMENT:1')).toContain(
      'تعديل قيد',
    );
    expect(describeJournalEntry('REVERSAL', 'REV:1')).toContain('عكسي');
    expect(describeJournalEntry('INVOICE_EDIT', 'EDIT:1')).toContain(
      'تعديل فاتورة',
    );
    expect(describeJournalEntry('VOID', 'VOID:1')).toContain('إلغاء فاتورة');
  });

  it('falls back to the raw source name for unmapped sources', () => {
    expect(describeJournalEntry('CUSTOM_OP', 'OP:trace-1')).toBe(
      'CUSTOM_OP — trace-1',
    );
  });

  it('handles empty sourceRef gracefully', () => {
    expect(describeJournalEntry('ORDER_INVOICE', '')).toBe('فاتورة جديدة');
  });

  it('truncates very long ref tails to 12 chars', () => {
    const desc = describeJournalEntry(
      'PAYMENT',
      'PAYMENT:CASH:abcdefghijklmnopqrstuvwxyz',
    );
    const tail = desc.split('— ')[1] ?? '';
    expect(tail.length).toBeLessThanOrEqual(12);
  });
});
