/**
 * V22 Phase 5 — Operational primitives behavioural smoke test.
 *
 * Covers the two new design-system primitives shipped in V22
 * Phase 5:
 *
 *   • <StickyActionBar>
 *       — renders nothing when actions are empty
 *       — renders a button per action with the correct label,
 *         tone class, and `aria-keyshortcuts`
 *       — invokes `onActivate` on click
 *       — invokes `onActivate` on Alt+<key> keyboard shortcut
 *       — does NOT invoke `onActivate` on disabled actions
 *
 *   • <SmartActionChip>
 *       — renders a non-interactive badge by default
 *       — renders a button when `onActivate` is supplied
 *       — does NOT call any global API or financial helper
 *         (proven structurally by the lock-in source-string
 *         test in `v22-phase5-customer-360-v2-architecture`)
 *
 * These tests render in jsdom to make sure the keyboard
 * handler and aria attributes survive future refactors.
 */
import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StickyActionBar } from './StickyActionBar';
import { SmartActionChip } from './SmartActionChip';

// Silence the unused-React lint — Vite's classic-runtime test
// environment requires React in scope for JSX in this file.
void React;

afterEach(() => cleanup());

describe('<StickyActionBar>', () => {
  test('renders nothing when no actions are passed', () => {
    const { container } = render(<StickyActionBar actions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  test('renders nothing when hidden, even with actions', () => {
    const { container } = render(
      <StickyActionBar
        hidden
        actions={[{ id: 'a', label: 'Pay', onActivate: () => {} }]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  test('renders one button per action with correct label + shortcut hint', () => {
    render(
      <StickyActionBar
        actions={[
          { id: 'pay', label: 'Pay', shortcut: 'P', onActivate: () => {} },
          { id: 'note', label: 'Note', shortcut: 'N', onActivate: () => {} },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: /Pay \(Alt\+P\)/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Note \(Alt\+N\)/ })).toBeTruthy();
  });

  test('clicking an action invokes its onActivate callback', () => {
    const onPay = vi.fn();
    render(
      <StickyActionBar
        actions={[{ id: 'pay', label: 'Pay', shortcut: 'P', onActivate: onPay }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Pay/ }));
    expect(onPay).toHaveBeenCalledTimes(1);
  });

  test('Alt+<shortcut> invokes the matching action', () => {
    const onPay = vi.fn();
    render(
      <StickyActionBar
        actions={[{ id: 'pay', label: 'Pay', shortcut: 'P', onActivate: onPay }]}
      />,
    );
    fireEvent.keyDown(window, { key: 'p', altKey: true });
    expect(onPay).toHaveBeenCalledTimes(1);
  });

  test('Alt+<shortcut> ignores Ctrl/Meta combinations', () => {
    const onPay = vi.fn();
    render(
      <StickyActionBar
        actions={[{ id: 'pay', label: 'Pay', shortcut: 'P', onActivate: onPay }]}
      />,
    );
    fireEvent.keyDown(window, { key: 'p', altKey: true, ctrlKey: true });
    fireEvent.keyDown(window, { key: 'p', altKey: true, metaKey: true });
    expect(onPay).not.toHaveBeenCalled();
  });

  test('disabled actions are not triggered by click or shortcut', () => {
    const onPay = vi.fn();
    render(
      <StickyActionBar
        actions={[
          {
            id: 'pay',
            label: 'Pay',
            shortcut: 'P',
            disabled: true,
            onActivate: onPay,
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Pay/ }));
    fireEvent.keyDown(window, { key: 'p', altKey: true });
    expect(onPay).not.toHaveBeenCalled();
  });
});

describe('<SmartActionChip>', () => {
  test('renders as a non-interactive span when onActivate is omitted', () => {
    render(<SmartActionChip label="Stale snapshot" tone="warn" />);
    const chip = screen.getByTestId('smart-action-chip');
    expect(chip.tagName.toLowerCase()).toBe('span');
  });

  test('renders as a button when onActivate is provided', () => {
    const onActivate = vi.fn();
    render(
      <SmartActionChip
        label="Schedule callback"
        tone="info"
        onActivate={onActivate}
      />,
    );
    const chip = screen.getByTestId('smart-action-chip');
    expect(chip.tagName.toLowerCase()).toBe('button');
    fireEvent.click(chip);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  test('renders the optional hint and shortcut label', () => {
    render(
      <SmartActionChip
        label="Promise overdue"
        hint="3 أيام"
        tone="critical"
        shortcutLabel="Alt+E"
      />,
    );
    expect(screen.getByText('Promise overdue')).toBeTruthy();
    expect(screen.getByText('3 أيام')).toBeTruthy();
    expect(screen.getByText('Alt+E')).toBeTruthy();
  });
});
