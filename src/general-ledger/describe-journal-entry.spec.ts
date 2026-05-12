import {
  normalizeLegacyJournalSourceRef,
  describeJournalEntry,
  describeJournalEntryForCustomerFacing,
  parseOrderIdFromInvoiceJournalRef,
  parsePlanNameFromContextLabel,
} from './double-entry-journal.service';

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

  it('falls back to a generic Arabic line when the source is unknown', () => {
    expect(describeJournalEntry('CUSTOM_OP', 'OP:trace-1')).toBe(
      'قيد في دفتر اليومية — trace-1',
    );
  });

  it('handles empty sourceRef gracefully', () => {
    expect(describeJournalEntry('ORDER_INVOICE', '')).toBe('فاتورة جديدة');
    expect(describeJournalEntry('WEIRD', '')).toBe('قيد محاسبي غير مصنّف');
  });

  it('normalises hyphenated legacy sourceRef shapes', () => {
    expect(
      normalizeLegacyJournalSourceRef(
        'INVOICE-8faa834f-d6c8-4f63-b1be-fd94eca3a6e3-SHORTFALL',
      ),
    ).toBe(
      'INVOICE:8faa834f-d6c8-4f63-b1be-fd94eca3a6e3:SHORTFALL',
    );
    expect(
      normalizeLegacyJournalSourceRef(
        'WALLET_FUNDING_SUBSCRIPTION-761c27db-3284-42bc-82d5-fdf3c24c336d',
      ),
    ).toBe(
      'WALLET_FUNDING:SUBSCRIPTION:761c27db-3284-42bc-82d5-fdf3c24c336d',
    );
    expect(
      normalizeLegacyJournalSourceRef(
        'PAYMENT-SUBSCRIPTION_ACTIVATION-761c27db-3284-42bc-82d5-fdf3c24c336d-RESIDUAL',
      ),
    ).toBe(
      'PAYMENT:SUBSCRIPTION_ACTIVATION:761c27db-3284-42bc-82d5-fdf3c24c336d:RESIDUAL',
    );
  });

  it('describes invoice shortfall after legacy normalisation', () => {
    expect(
      describeJournalEntry(
        'INVOICE',
        'INVOICE-8faa834f-d6c8-4f63-b1be-fd94eca3a6e3-SHORTFALL',
      ),
    ).toContain('ذمم');
  });

  it('describes colon-form invoice shortfall and wallet funding', () => {
    expect(
      describeJournalEntry('INVOICE', 'INVOICE:ord-uuid-1:SHORTFALL'),
    ).toContain('ذمم');
    expect(
      describeJournalEntry(
        'PROCESS_TRANSACTION',
        'WALLET_FUNDING:SUBSCRIPTION:761c27db-3284-42bc-82d5-fdf3c24c336d',
      ),
    ).toContain('تمويل');
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

describe('parseOrderIdFromInvoiceJournalRef', () => {
  const oid = '8faa834f-d6c8-4f63-b1be-fd94eca3a6e3';
  it('extracts order id from SHORTFALL refs', () => {
    expect(
      parseOrderIdFromInvoiceJournalRef(
        'INVOICE',
        `INVOICE-${oid}-SHORTFALL`,
      ),
    ).toBe(oid);
  });
  it('extracts order id from SUBSCRIPTION_OVERUSE refs', () => {
    expect(
      parseOrderIdFromInvoiceJournalRef(
        'INVOICE',
        `INVOICE:${oid}:SUBSCRIPTION_OVERUSE`,
      ),
    ).toBe(oid);
  });
});

describe('describeJournalEntryForCustomerFacing', () => {
  const shortfallRef =
    'INVOICE-8faa834f-d6c8-4f63-b1be-fd94eca3a6e3-SHORTFALL';
  it('replaces UUID tail with order serial label for shortfall', () => {
    expect(
      describeJournalEntryForCustomerFacing(
        'INVOICE',
        shortfallRef,
        'طلب S-100',
      ),
    ).toBe('ذمم عملاء من فاتورة (المتبقي) — طلب S-100');
  });
  it('omits technical id when no friendly label (shortfall)', () => {
    expect(
      describeJournalEntryForCustomerFacing('INVOICE', shortfallRef, null),
    ).toBe('ذمم عملاء من فاتورة (المتبقي)');
  });

  it('uses subscription plan name for wallet funding row', () => {
    const ref =
      'WALLET_FUNDING:SUBSCRIPTION:761c27db-3284-42bc-82d5-fdf3c24c336d';
    expect(
      describeJournalEntryForCustomerFacing(
        'PROCESS_TRANSACTION',
        ref,
        null,
        'باقة اشتراك 20',
      ),
    ).toBe('تمويل محفظة اشتراك — باقة اشتراك 20');
  });

  it('uses subscription plan name for subscription activation payment', () => {
    const ref =
      'PAYMENT:SUBSCRIPTION_ACTIVATION:761c27db-3284-42bc-82d5-fdf3c24c336d:RESIDUAL';
    expect(
      describeJournalEntryForCustomerFacing(
        'PAYMENT',
        ref,
        null,
        'باقة اشتراك 20',
      ),
    ).toBe('تسديد — تفعيل اشتراك (تسوية المتبقي) — باقة اشتراك 20');
  });

  it('replaces CC partial payment tail with payment channel Arabic label', () => {
    const ref =
      'PAYMENT:CC_PARTIAL_DEBT_PAYMENT:4955493a-e067-4b2c-9c1d-000000000001:RESIDUAL';
    expect(
      describeJournalEntryForCustomerFacing(
        'PAYMENT',
        ref,
        null,
        null,
        'نقدي',
      ),
    ).toBe('تسديد جزئي — مركز الاتصال — نقدي');
    expect(
      describeJournalEntryForCustomerFacing('PAYMENT', ref, null, null, null),
    ).toBe('تسديد جزئي — مركز الاتصال');
  });

  it('uses friendly description for CC debt-discount journal ref', () => {
    expect(
      describeJournalEntryForCustomerFacing(
        'DEBT_DISCOUNT',
        'JOURNAL:DEBT_DISCOUNT:cust-uuid:th-uuid',
        null,
      ),
    ).toBe('خصم ذمم حسنة — مركز الاتصال (هدية)');
  });
});

describe('parsePlanNameFromContextLabel', () => {
  it('reads plan name before middle dot', () => {
    expect(
      parsePlanNameFromContextLabel(
        'الباقة: باقة اشتراك 20 · الدفع: أونلاين / بطاقة',
      ),
    ).toBe('باقة اشتراك 20');
  });
  it('returns null when only payment line exists', () => {
    expect(parsePlanNameFromContextLabel('الدفع: كي‌نت')).toBeNull();
  });
});
