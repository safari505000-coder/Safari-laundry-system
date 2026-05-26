/**
 * CreateDispatchDialog — website-order prefill guard.
 * Ensures `defaultInstructionNote` lands in the driver note field when opened.
 */
import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CreateDispatchDialog } from './create-dispatch-dialog';

void React;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? _key,
  }),
}));

vi.mock('../hooks/use-cc-drivers', () => ({
  useCcDrivers: () => ({
    drivers: [{ id: 'd1', name: 'سائق 1', isActive: true, activeLoad: 0 }],
    loading: false,
    refreshing: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock('../hooks/use-cc-dispatch-actions', () => ({
  useCcDispatchActions: () => ({
    create: vi.fn(),
    submitting: false,
  }),
}));

afterEach(() => cleanup());

describe('<CreateDispatchDialog /> defaultInstructionNote', () => {
  test('prefills the driver note textarea when opened from website orders', () => {
    render(
      <CreateDispatchDialog
        open
        onOpenChange={() => undefined}
        customerId="cust-1"
        customerName="محمد"
        isCustomerBlocked={false}
        defaultInstructionNote="الوقت المفضل: الخميس، ٢١ مايو ٢٠٢٤، ٨:٠٦ م"
        onCreated={() => undefined}
      />,
    );

    const note = screen.getByRole('textbox', {
      name: /ملاحظة للسائق/i,
    }) as HTMLTextAreaElement;
    expect(note.value).toBe('الوقت المفضل: الخميس، ٢١ مايو ٢٠٢٤، ٨:٠٦ م');
  });

  test('shows blocked banner and disables submit when customer is blocked', () => {
    render(
      <CreateDispatchDialog
        open
        onOpenChange={() => undefined}
        customerId="cust-1"
        customerName="محمد"
        isCustomerBlocked
        onCreated={() => undefined}
      />,
    );

    expect(screen.getByTestId('cc-create-dispatch-blocked-banner')).toBeTruthy();
    expect(screen.getByTestId('cc-create-dispatch-submit')).toBeDisabled();
  });
});
