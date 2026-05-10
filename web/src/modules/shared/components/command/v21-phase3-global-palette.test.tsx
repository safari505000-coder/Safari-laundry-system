/**
 * V21 Phase 3 — Global Command Palette wiring + behaviour lock-in.
 *
 * These tests are independent witnesses that the
 * `GlobalCommandPalette` wrapper:
 *
 *   • Is mounted inside `ExecutiveShell` (so every authenticated
 *     route inherits it, not just one page).
 *   • Registers `Ctrl/Cmd + K` via the canonical
 *     `useGlobalShortcut` hook, not bespoke `addEventListener`.
 *   • Performs zero financial work — no fetch, no apiJson,
 *     no canonical-money helpers, no Prisma.
 *   • Behaviourally toggles open on Ctrl+K and closes on Esc.
 *
 * Removing or weakening any of these protections fails CI.
 */
import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GlobalCommandPalette } from './GlobalCommandPalette';

afterEach(() => cleanup());

/* ────────────────────────────────────────────────────────────────
 * Path constants — resolved relative to the web/ workspace root,
 * which is process.cwd() when vitest runs from `web/`.
 * ──────────────────────────────────────────────────────────────── */

const WEB_ROOT = process.cwd().endsWith('web')
  ? process.cwd()
  : join(process.cwd(), 'web');

const SHELL_PATH = join(
  WEB_ROOT,
  'src/modules/shared/components/shell/executive-shell.tsx',
);
const PALETTE_PATH = join(
  WEB_ROOT,
  'src/modules/shared/components/command/GlobalCommandPalette.tsx',
);

/* ────────────────────────────────────────────────────────────────
 * 1. WIRING GUARD — The wrapper is imported AND rendered in
 *    the ExecutiveShell. A future PR cannot accidentally remove
 *    one without the other.
 * ──────────────────────────────────────────────────────────────── */

describe('V21 Phase 3 — global command palette wiring', () => {
  test('1. ExecutiveShell imports GlobalCommandPalette', () => {
    const src = readFileSync(SHELL_PATH, 'utf8');
    expect(src).toMatch(
      /import\s*\{[^}]*GlobalCommandPalette[^}]*\}\s*from\s*'@\/modules\/shared\/components\/command\/GlobalCommandPalette'/,
    );
  });

  test('2. ExecutiveShell renders <GlobalCommandPalette /> inside its layout', () => {
    const src = readFileSync(SHELL_PATH, 'utf8');
    expect(src).toMatch(/<GlobalCommandPalette\s*\/>/);
  });

  test('3. GlobalCommandPalette uses the canonical useGlobalShortcut hook with key=k, mod=mod', () => {
    const src = readFileSync(PALETTE_PATH, 'utf8');
    // Hook is imported
    expect(src).toMatch(/useGlobalShortcut/);
    expect(src).toMatch(/from\s+'@\/modules\/shared\/hooks\/use-global-shortcut'/);
    // And used with the canonical Ctrl/Cmd+K spec
    expect(src).toMatch(/key:\s*'k'/);
    expect(src).toMatch(/mod:\s*'mod'/);
  });

  test('4. GlobalCommandPalette has zero financial side-effects (no fetch, no apiJson, no Prisma)', () => {
    const src = readFileSync(PALETTE_PATH, 'utf8');
    // No raw fetch
    expect(src).not.toMatch(/[^a-zA-Z_$.]fetch\s*\(/);
    // No apiJson / apiFetch (write surfaces)
    expect(src).not.toMatch(/apiJson|apiFetch/);
    // No canonical money helpers (would imply financial work in UI)
    expect(src).not.toMatch(/sumKwdStrings|formatKwdAmount|isPositiveKd|isNegativeKd|isZeroKd|isMaterialKd|compareKwdStrings/);
    // No Prisma (paranoia — frontend should not touch Prisma anyway)
    expect(src).not.toMatch(/prisma|PrismaClient/i);
  });

  test('5. GlobalCommandPalette only navigates (uses react-router useNavigate)', () => {
    const src = readFileSync(PALETTE_PATH, 'utf8');
    expect(src).toMatch(/useNavigate/);
    expect(src).toMatch(/from\s+'react-router-dom'/);
  });
});

/* ────────────────────────────────────────────────────────────────
 * 2. BEHAVIOUR — Ctrl+K opens, Esc closes. Real DOM render so
 *    we exercise the wiring through React, not the source string.
 *
 *    NOTE: We mount the palette under a stub auth context that
 *    yields a logged-in user; the palette returns null otherwise.
 * ──────────────────────────────────────────────────────────────── */

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'u-1',
      username: 'op',
      fullName: 'Operator',
      phone: null,
      safariRole: 'OWNER',
      branchId: null,
    },
    hasRole: (..._roles: string[]) => true,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: 'en' },
  }),
}));

describe('V21 Phase 3 — global command palette behaviour', () => {
  function renderHarness(): void {
    render(
      <MemoryRouter>
        <GlobalCommandPalette />
      </MemoryRouter>,
    );
  }

  test('6. Ctrl+K opens the palette dialog', () => {
    renderHarness();
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    act(() => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
  });

  test('7. Esc closes the open palette', () => {
    renderHarness();
    act(() => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    act(() => {
      const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
      fireEvent.keyDown(dialog, { key: 'Escape' });
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test('8. Default command set surfaces at least the dashboard target', () => {
    renderHarness();
    act(() => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toMatch(/dashboard|لوحة التحكم/i);
  });
});
