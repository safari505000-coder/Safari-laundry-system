/**
 * V20.9 — Phase 3 Smart Action Engine contracts.
 *
 *   1. CRITICAL fraud rises to the top.
 *   2. SLA breach + high risk → escalate (above set-promise).
 *   3. Broken promise is always surfaced.
 *   4. CRITICAL risk + 60d overdue → block-customer is offered.
 *   5. Healthy customer returns the no-action sentinel.
 *   6. Stable ordering (priority DESC) — no flicker.
 *   7. Tier helper: ACTIVE promise => high; CRITICAL risk => low.
 */
import { describe, expect, test } from 'vitest';
import {
  paymentProbabilityTier,
  recommendActions,
  type SmartActionInput,
} from './smart-action-engine';

const baseSignals: SmartActionInput = {
  daysOverdue: 0,
  riskLevel: 'LOW',
  fraudSeverity: null,
  promiseStatus: 'NONE',
  lastContactDaysAgo: 1,
  slaStatus: 'OK',
  hasOpenInvoice: false,
  collectionsStage: null,
};

describe('V20.9 — smart action engine', () => {
  test('1. CRITICAL fraud is the top recommendation', () => {
    const r = recommendActions({
      ...baseSignals,
      fraudSeverity: 'CRITICAL',
    });
    expect(r[0].id).toBe('open_fraud_investigation');
    expect(r[0].critical).toBe(true);
    expect(r[0].priority).toBe(100);
  });

  test('2. SLA breach + HIGH risk recommends escalation above set-promise', () => {
    const r = recommendActions({
      ...baseSignals,
      slaStatus: 'BREACHED',
      riskLevel: 'HIGH',
      hasOpenInvoice: true,
      daysOverdue: 5,
    });
    const ids = r.map((a) => a.id);
    expect(ids[0]).toBe('escalate_collection');
    expect(ids).toContain('set_promise_to_pay');
    const escalateIdx = ids.indexOf('escalate_collection');
    const setPromiseIdx = ids.indexOf('set_promise_to_pay');
    expect(escalateIdx).toBeLessThan(setPromiseIdx);
  });

  test('3. broken promise is always surfaced', () => {
    const r = recommendActions({
      ...baseSignals,
      promiseStatus: 'BROKEN',
      hasOpenInvoice: true,
      daysOverdue: 12,
    });
    expect(r.map((a) => a.id)).toContain('log_broken_promise');
  });

  test('4. CRITICAL risk + chronic 60d overdue offers block-customer', () => {
    const r = recommendActions({
      ...baseSignals,
      riskLevel: 'CRITICAL',
      daysOverdue: 75,
      hasOpenInvoice: true,
    });
    expect(r.map((a) => a.id)).toContain('block_customer');
  });

  test('5. healthy customer returns the no-action sentinel', () => {
    const r = recommendActions(baseSignals);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('mark_no_action_needed');
    expect(r[0].priority).toBe(0);
    expect(r[0].critical).toBe(false);
  });

  test('6. stable ordering (priority DESC) — repeated calls yield identical sequence', () => {
    const input = {
      ...baseSignals,
      hasOpenInvoice: true,
      daysOverdue: 30,
      promiseStatus: 'BROKEN' as const,
      slaStatus: 'BREACHED' as const,
      riskLevel: 'HIGH' as const,
      lastContactDaysAgo: 14,
      fraudSeverity: 'HIGH' as const,
    };
    const a = recommendActions(input).map((x) => `${x.id}:${x.priority}`);
    const b = recommendActions(input).map((x) => `${x.id}:${x.priority}`);
    expect(a).toEqual(b);
    // strictly DESC
    const priorities = recommendActions(input).map((x) => x.priority);
    for (let i = 1; i < priorities.length; i += 1) {
      expect(priorities[i - 1]).toBeGreaterThanOrEqual(priorities[i]);
    }
  });

  test('7. paymentProbabilityTier: ACTIVE promise => high; CRITICAL risk => low', () => {
    expect(
      paymentProbabilityTier({
        riskLevel: 'CRITICAL',
        promiseStatus: 'ACTIVE',
        daysOverdue: 90,
      }),
    ).toBe('high');
    expect(
      paymentProbabilityTier({
        riskLevel: 'CRITICAL',
        promiseStatus: 'NONE',
        daysOverdue: 0,
      }),
    ).toBe('low');
    expect(
      paymentProbabilityTier({
        riskLevel: 'MEDIUM',
        promiseStatus: 'NONE',
        daysOverdue: 0,
      }),
    ).toBe('medium');
  });
});
