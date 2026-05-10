/**
 * V23 Phase 6 — PresenceRibbon behavioural test.
 *
 * Validates that the visibility-only presence ribbon:
 *   • renders the empty-state message when no co-viewers are present
 *   • renders one badge per active co-viewer with the Arabic role label
 *   • exposes an aria-live region for accessibility
 *   • never embeds any financial value (lock-in)
 */
import React from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { PresenceRibbon } from './PresenceRibbon';
import type { PresenceHeartbeat } from './types';

void React;

afterEach(() => cleanup());

const fixture = (overrides: Partial<PresenceHeartbeat> = {}): PresenceHeartbeat => ({
  userId: 'u-1',
  username: 'agent.one',
  fullName: 'موظف أول',
  safariRole: 'CALL_CENTER',
  branchId: 'br-1',
  scopeKind: 'customer',
  scopeId: 'cust-1',
  lastSeenAt: '2026-05-09T15:00:00.000Z',
  ...overrides,
});

describe('<PresenceRibbon>', () => {
  test('renders the empty-state message when no co-viewers are present', () => {
    render(<PresenceRibbon coviewers={[]} />);
    expect(
      screen.getByText('لا يوجد موظفون آخرون يشاهدون هذا السجل حالياً'),
    ).toBeTruthy();
  });

  test('renders one entry per co-viewer with display name + Arabic role', () => {
    render(
      <PresenceRibbon
        coviewers={[
          fixture({ userId: 'u-1', fullName: 'سعد', safariRole: 'CALL_CENTER' }),
          fixture({ userId: 'u-2', fullName: 'علي', safariRole: 'ACCOUNTANT' }),
        ]}
      />,
    );
    const list = screen.getByTestId('presence-list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(list).getByText('سعد')).toBeTruthy();
    expect(within(list).getByText('علي')).toBeTruthy();
    expect(within(list).getByText(/كول سنتر/)).toBeTruthy();
    expect(within(list).getByText(/محاسب/)).toBeTruthy();
  });

  test('falls back to username when fullName is null', () => {
    render(
      <PresenceRibbon
        coviewers={[fixture({ userId: 'u-1', username: 'agent.x', fullName: null })]}
      />,
    );
    expect(screen.getByText('agent.x')).toBeTruthy();
  });

  test('exposes a polite live region for screen readers', () => {
    const { container } = render(
      <PresenceRibbon coviewers={[fixture({ userId: 'u-1' })]} />,
    );
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
  });

  test('does NOT contain any KD/currency text (visibility-only invariant)', () => {
    const { container } = render(
      <PresenceRibbon
        coviewers={[
          fixture({ userId: 'u-1', fullName: 'سعد', safariRole: 'CALL_CENTER' }),
        ]}
      />,
    );
    expect(container.textContent ?? '').not.toMatch(/د\.ك|KWD|\d+\.\d{3}/);
  });
});
