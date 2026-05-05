import type { Customer360InternalDto } from './customer-360.types';
import { sanitizeCustomerView, applyCustomerFriendlyPhrases } from './sanitize-customer-360-view';

describe('sanitizeCustomerView', () => {
  const baseInternal = (): Customer360InternalDto => ({
    customer: {
      id: 'c1',
      displayName: 'Test',
      phone: '50000000',
      phone2: null,
    },
    subscriptions: [],
    subscription: {
      subscriptionValueKd: '40.0000',
      subscriptionConsumedKd: '10.0000',
      subscriptionRemainingKd: '30.0000',
    },
    statement: {
      financials: {
        consumedKd: '10.0000',
        totalInvoicesKd: '10.0000',
        subscriptionValueKd: '40.0000',
        subscriptionConsumedKd: '10.0000',
        subscriptionRemainingKd: '30.0000',
        totalPaymentsKd: '2.0000',
        totalDueKd: '8.0000',
        isBlocked: false,
        blockReason: null,
        blockedAtIso: null,
      },
      narrativeLines: ['Line about debt and overuse for staff'],
    },
    rating: 'GOOD',
    insight: '✅ العميل ملتزم',
    score: { value: 80, feedbackAverage: 4.2, factors: ['debt'] },
    insights: { summary: 'debt watch', detail: 'overuse pattern' },
    alerts: [{ code: 'X', message: 'debt high' }],
    internalNotes: 'Secret debt note',
  });

  it('removes score/insights and does not expose alerts/internalNotes', () => {
    const out = sanitizeCustomerView(baseInternal());
    expect(out.score).toBeNull();
    expect(out.insights).toBeNull();
    expect('alerts' in out).toBe(false);
    expect('internalNotes' in out).toBe(false);
    expect(out.friendlySummary.length).toBeGreaterThan(10);
  });

  it('replaces debt/overuse phrasing in narrative lines', () => {
    const out = sanitizeCustomerView(baseInternal());
    const joined = (out.statement.narrativeLines ?? []).join(' ');
    expect(joined).not.toMatch(/\bdebt\b/i);
    expect(joined).not.toMatch(/\boveruse\b/i);
    expect(joined).toMatch(/المبلغ المستحق/);
    expect(joined).toMatch(/تجاوز الباقة/);
  });

  it('keeps monetary strings identical', () => {
    const internal = baseInternal();
    const out = sanitizeCustomerView(internal);
    expect(out.statement.financials).toEqual(internal.statement.financials);
  });

  it('applyCustomerFriendlyPhrases replaces tokens', () => {
    expect(applyCustomerFriendlyPhrases('debt and overuse')).toBe(
      'المبلغ المستحق and تجاوز الباقة',
    );
  });
});
