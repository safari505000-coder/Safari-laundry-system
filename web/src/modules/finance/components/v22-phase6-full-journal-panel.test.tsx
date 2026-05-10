import React from 'react';
import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  FullJournalEntriesPanel,
  type FullJournalEntry,
} from './FullJournalEntriesPanel';

void React;

const SAMPLE_ENTRIES: FullJournalEntry[] = [
  {
    entryId: 'entry-1',
    source: 'INVOICE',
    sourceRef: 'INVOICE:order-1',
    description: 'فاتورة جديدة — order-1',
    createdAt: '2026-05-09T03:00:00.000Z',
    totalDebitKd: '35.0000',
    totalCreditKd: '35.0000',
    balanced: true,
    lines: [
      {
        accountCode: '1300',
        accountName: 'ACCOUNTS_RECEIVABLE',
        debitKd: '35.0000',
        creditKd: '0.0000',
      },
      {
        accountCode: '4100',
        accountName: 'REVENUE',
        debitKd: '0.0000',
        creditKd: '35.0000',
      },
    ],
  },
  {
    entryId: 'entry-2',
    source: 'PAYMENT',
    sourceRef: 'PAYMENT:CASH:residual-1',
    description: 'تسديد كاش — residual-1',
    createdAt: '2026-05-09T04:00:00.000Z',
    totalDebitKd: '25.0000',
    totalCreditKd: '25.0000',
    balanced: true,
    lines: [
      {
        accountCode: '1100',
        accountName: 'CASH',
        debitKd: '25.0000',
        creditKd: '0.0000',
      },
      {
        accountCode: '1300',
        accountName: 'ACCOUNTS_RECEIVABLE',
        debitKd: '0.0000',
        creditKd: '25.0000',
      },
    ],
  },
];

describe('V22 Phase 6 — FullJournalEntriesPanel', () => {
  test('renders both sides of every balanced entry with Arabic account labels', () => {
    render(<FullJournalEntriesPanel entries={SAMPLE_ENTRIES} />);

    const cards = screen.getAllByTestId('full-journal-entry');
    expect(cards).toHaveLength(2);

    expect(screen.getAllByText('متوازن').length).toBe(2);

    expect(screen.getByText('فاتورة جديدة — order-1')).toBeInTheDocument();
    expect(screen.getByText('تسديد كاش — residual-1')).toBeInTheDocument();

    // The last entry is expanded by default — both legs of the cash
    // payment must be visible (Dr CASH / Cr ACCOUNTS_RECEIVABLE).
    expect(screen.getAllByText('الصندوق (نقدي)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ذمم العملاء').length).toBeGreaterThan(0);

    // The header row (الحساب / مدين / دائن) confirms the double-entry
    // table is rendered for the visible entry.
    expect(screen.getByText('الحساب')).toBeInTheDocument();
    expect(screen.getByText('مدين (د.ك)')).toBeInTheDocument();
    expect(screen.getByText('دائن (د.ك)')).toBeInTheDocument();
  });

  test('flags unbalanced entries with non-zero drift', () => {
    const broken: FullJournalEntry = {
      entryId: 'entry-broken',
      source: 'PAYMENT',
      sourceRef: 'PAYMENT:CASH:broken',
      description: 'تسديد كاش — broken',
      createdAt: '2026-05-09T05:00:00.000Z',
      totalDebitKd: '10.0000',
      totalCreditKd: '9.5000',
      balanced: false,
      lines: [
        {
          accountCode: '1100',
          accountName: 'CASH',
          debitKd: '10.0000',
          creditKd: '0.0000',
        },
        {
          accountCode: '1300',
          accountName: 'ACCOUNTS_RECEIVABLE',
          debitKd: '0.0000',
          creditKd: '9.5000',
        },
      ],
    };
    render(<FullJournalEntriesPanel entries={[broken]} />);

    expect(screen.getByText('غير متوازن')).toBeInTheDocument();
  });

  test('shows empty state when there are no entries', () => {
    render(<FullJournalEntriesPanel entries={[]} />);
    expect(
      screen.getByText('لا توجد قيود مزدوجة لهذا العميل.'),
    ).toBeInTheDocument();
  });

  test('shows loading state when loading and no entries yet', () => {
    render(<FullJournalEntriesPanel entries={[]} loading />);
    expect(screen.getByText('جاري تحميل القيود الكاملة...')).toBeInTheDocument();
  });
});
