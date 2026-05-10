/**
 * V23 Phase 6 — RealtimeStatusBadge test suite.
 *
 * Validates the pure classifier and the rendered badge against
 * every state transition the SSE feed can produce.
 */
import React from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  RealtimeStatusBadge,
  classifyRealtimeStatus,
} from './RealtimeStatusBadge';
import type { RealtimeFeedState } from '@/modules/finance';

void React;
afterEach(() => cleanup());

const NOW = Date.parse('2026-05-09T15:00:00.000Z');
const minutesAgo = (m: number): string => new Date(NOW - m * 60_000).toISOString();

const stateOf = (overrides: Partial<RealtimeFeedState> = {}): RealtimeFeedState => ({
  connected: true,
  lastEventAt: null,
  reconnects: 0,
  error: null,
  ...overrides,
});

describe('classifyRealtimeStatus', () => {
  test('not connected + error → "error"', () => {
    expect(
      classifyRealtimeStatus(stateOf({ connected: false, error: 'sse-error' }), NOW).status,
    ).toBe('error');
  });
  test('not connected + no error → "offline"', () => {
    expect(
      classifyRealtimeStatus(stateOf({ connected: false, error: null }), NOW).status,
    ).toBe('offline');
  });
  test('connected + no events yet → "idle"', () => {
    expect(
      classifyRealtimeStatus(stateOf({ connected: true, lastEventAt: null }), NOW).status,
    ).toBe('idle');
  });
  test('connected + recent event → "live"', () => {
    expect(
      classifyRealtimeStatus(
        stateOf({ connected: true, lastEventAt: minutesAgo(0.5) }),
        NOW,
      ).status,
    ).toBe('live');
  });
  test('connected + 2-minute old event → "idle"', () => {
    expect(
      classifyRealtimeStatus(
        stateOf({ connected: true, lastEventAt: minutesAgo(2) }),
        NOW,
      ).status,
    ).toBe('idle');
  });
  test('connected + 10-minute old event → "stale"', () => {
    expect(
      classifyRealtimeStatus(
        stateOf({ connected: true, lastEventAt: minutesAgo(10) }),
        NOW,
      ).status,
    ).toBe('stale');
  });
  test('unparseable lastEventAt does not crash', () => {
    expect(
      classifyRealtimeStatus(
        stateOf({ connected: true, lastEventAt: 'not-a-date' }),
        NOW,
      ).status,
    ).toBe('idle');
  });
});

describe('<RealtimeStatusBadge>', () => {
  test('renders the live label and tone when feed is healthy', () => {
    render(
      <RealtimeStatusBadge
        state={stateOf({ connected: true, lastEventAt: minutesAgo(0.5) })}
        now={NOW}
      />,
    );
    const badge = screen.getByTestId('realtime-status-badge');
    expect(badge.getAttribute('data-status')).toBe('live');
    expect(badge.textContent).toMatch(/مباشر/);
  });

  test('renders the offline label when SSE is reconnecting', () => {
    render(
      <RealtimeStatusBadge
        state={stateOf({ connected: false, reconnects: 3, error: null })}
        now={NOW}
      />,
    );
    const badge = screen.getByTestId('realtime-status-badge');
    expect(badge.getAttribute('data-status')).toBe('offline');
    expect(badge.textContent).toMatch(/إعادة اتصال…/);
    expect(badge.textContent).toMatch(/3 إعادة اتصال/);
  });

  test('compact mode hides the textual label but keeps aria info', () => {
    render(
      <RealtimeStatusBadge
        state={stateOf({ connected: true, lastEventAt: minutesAgo(0.5) })}
        now={NOW}
        compact
      />,
    );
    const badge = screen.getByTestId('realtime-status-badge');
    expect(badge.textContent ?? '').not.toMatch(/مباشر/);
    expect(badge.getAttribute('data-status')).toBe('live');
  });

  test('does NOT render any KD/currency text (visibility-only)', () => {
    const { container } = render(
      <RealtimeStatusBadge
        state={stateOf({ connected: true, lastEventAt: minutesAgo(2) })}
        now={NOW}
      />,
    );
    expect(container.textContent ?? '').not.toMatch(/د\.ك|KWD|\d+\.\d{3}/);
  });
});
