/**
 * V20.9 — Phase 4 Command Palette + UX hooks contracts.
 */
import React, { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { CommandPalette, type PaletteCommand } from './CommandPalette';
import { rankCommands } from './rank-commands';
import { useGlobalShortcut } from '../../hooks/use-global-shortcut';

afterEach(() => cleanup());

const sampleCommands: PaletteCommand[] = [
  { id: 'go-dashboard', title: 'Open Dashboard', subtitle: '/dashboard', group: 'Nav', run: vi.fn() },
  { id: 'go-collections', title: 'Open Collections', subtitle: '/collections', group: 'Nav', run: vi.fn() },
  { id: 'jump-customer', title: 'Jump to Customer', keywords: ['cust', 'find'], run: vi.fn(), hideFromDefault: true },
  { id: 'create-promise', title: 'Create Promise to Pay', critical: true, run: vi.fn() },
];

describe('V20.9 — command palette ranking', () => {
  test('1. empty query returns defaultIds first, hides hidden defaults', () => {
    const r = rankCommands(sampleCommands, '', ['go-collections']);
    expect(r.map((c) => c.id)).toEqual([
      'go-collections',
      'go-dashboard',
      'create-promise',
    ]);
  });

  test('2. fuzzy match: "cust" finds Jump-to-Customer via keywords', () => {
    const r = rankCommands(sampleCommands, 'cust');
    expect(r[0].id).toBe('jump-customer');
  });

  test('3. title hits outrank subtitle hits', () => {
    const r = rankCommands(sampleCommands, 'collect');
    expect(r[0].id).toBe('go-collections');
  });

  test('4. no match returns empty array', () => {
    const r = rankCommands(sampleCommands, 'xyzzy-not-there');
    expect(r).toEqual([]);
  });
});

describe('V20.9 — command palette rendering', () => {
  function PaletteHarness({ open }: { open: boolean }): JSX.Element {
    const [openState, setOpen] = useState(open);
    return (
      <CommandPalette
        open={openState}
        onClose={() => setOpen(false)}
        commands={sampleCommands}
        defaultIds={['go-dashboard']}
      />
    );
  }

  test('5. opens, lists default command first, closes on Esc', () => {
    render(<PaletteHarness open={true} />);
    const first = document.querySelector('li[data-cmd-id]');
    expect(first?.getAttribute('data-cmd-id')).toBe('go-dashboard');
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    // After close, the palette unmounts.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('6. arrow + Enter dispatches the highlighted command', () => {
    const cmds: PaletteCommand[] = [
      { id: 'a', title: 'Alpha', run: vi.fn() },
      { id: 'b', title: 'Beta', run: vi.fn() },
    ];
    function Harness(): JSX.Element {
      const [open, setOpen] = useState(true);
      return (
        <CommandPalette open={open} onClose={() => setOpen(false)} commands={cmds} />
      );
    }
    render(<Harness />);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(cmds[1].run).toHaveBeenCalled();
  });
});

describe('V20.9 — global shortcut hook', () => {
  test('7. fires Ctrl+K outside inputs; suppressed inside an input', () => {
    const fired = vi.fn();
    function Harness(): JSX.Element {
      useGlobalShortcut({ key: 'k', mod: 'mod', handler: fired });
      return <input placeholder="type here" />;
    }
    render(<Harness />);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }),
      );
    });
    expect(fired).toHaveBeenCalledTimes(1);

    // From inside the input, should NOT fire.
    const input = screen.getByPlaceholderText('type here');
    input.focus();
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
      );
    });
    expect(fired).toHaveBeenCalledTimes(1);
  });
});
