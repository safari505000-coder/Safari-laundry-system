/**
 * V20.7 — Phase 8 UX polish smoke suite.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BulkActionBar, KeyboardShortcutHelp } from './index';

describe('V20.7 — Phase 8 UX polish', () => {
  test('BulkActionBar hides when nothing is selected', () => {
    const { container } = render(
      <BulkActionBar
        selectedCount={0}
        actions={[
          {
            id: 'pay',
            label: 'Mark paid',
            tone: 'success',
            onClick: () => undefined,
          },
        ]}
        onClear={() => undefined}
        locale="en"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('BulkActionBar shows action chips and emits on click', () => {
    const onPay = vi.fn();
    const onClear = vi.fn();
    render(
      <BulkActionBar
        selectedCount={3}
        totalCount={20}
        actions={[
          {
            id: 'pay',
            label: 'Mark paid',
            tone: 'success',
            onClick: onPay,
          },
        ]}
        onClear={onClear}
        locale="en"
      />,
    );
    expect(screen.getByText('3 selected / 20')).toBeInTheDocument();
    screen.getByRole('button', { name: /Mark paid/ }).click();
    expect(onPay).toHaveBeenCalled();
    screen.getByRole('button', { name: 'Clear selection' }).click();
    expect(onClear).toHaveBeenCalled();
  });

  test('KeyboardShortcutHelp opens on `?` and closes on Escape', () => {
    render(
      <KeyboardShortcutHelp
        shortcuts={[
          { combo: 'Alt+P', description: 'Record payment' },
          { combo: 'Alt+M', description: 'Schedule promise' },
        ]}
        locale="en"
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(screen.getByText('Record payment')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('KeyboardShortcutHelp ignores `?` while typing in an input', () => {
    render(
      <>
        <input data-testid="t" />
        <KeyboardShortcutHelp
          shortcuts={[{ combo: 'Alt+P', description: 'Record payment' }]}
          locale="en"
        />
      </>,
    );
    const input = screen.getByTestId('t');
    input.focus();
    fireEvent.keyDown(input, { key: '?' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
