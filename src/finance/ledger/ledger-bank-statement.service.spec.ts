import { bankStatementDescriptionFromJournalSource } from './ledger-bank-statement.service';

describe('bankStatementDescriptionFromJournalSource', () => {
  it('maps POS / INVOICE_ISSUED / ORDER_INVOICE to sales', () => {
    expect(
      bankStatementDescriptionFromJournalSource('POS_SALE_COMPLETED', ''),
    ).toBe('فاتورة مبيعات');
    expect(
      bankStatementDescriptionFromJournalSource('INVOICE_ISSUED', 'x'),
    ).toBe('فاتورة مبيعات');
    expect(
      bankStatementDescriptionFromJournalSource('ORDER_INVOICE', 'x'),
    ).toBe('فاتورة مبيعات');
  });

  it('maps subscription activation', () => {
    expect(
      bankStatementDescriptionFromJournalSource('SUBSCRIPTION_ACTIVATION', ''),
    ).toBe('تفعيل اشتراك');
    expect(
      bankStatementDescriptionFromJournalSource(
        'PAYMENT',
        'PAYMENT:SUBSCRIPTION_ACTIVATION:u1:u2',
      ),
    ).toBe('تفعيل اشتراك');
  });

  it('maps wallet funding ref', () => {
    expect(
      bankStatementDescriptionFromJournalSource(
        'PROCESS_TRANSACTION',
        'WALLET_FUNDING:SUBSCRIPTION:761c27db-3284-42bc-82d5-fdf3c24c336d',
      ),
    ).toBe('إيداع مالي');
  });

  it('maps wallet settlement', () => {
    expect(
      bankStatementDescriptionFromJournalSource('WALLET_SETTLEMENT', ''),
    ).toBe('تسوية من المحفظة');
    expect(
      bankStatementDescriptionFromJournalSource('WALLET_ABSORPTION', ''),
    ).toBe('تسوية من المحفظة');
  });

  it('defaults unknown sources', () => {
    expect(
      bankStatementDescriptionFromJournalSource('ADJUSTMENT', ''),
    ).toBe('عملية مالية');
  });
});
