import { useEffect } from 'react';

/**
 * V20.6 — Phase 7 keyboard-first workflow.
 *
 * Binds collector shortcuts to a window-level keydown listener. Keeps
 * the workspace usable from a single hand on a phone-headset shift.
 * Conventions:
 *
 *   • Single-letter shortcuts are wrapped in `Alt+letter` to avoid
 *     stomping on the user's typing inside text fields.
 *   • A pressed shortcut is consumed (`preventDefault`) so the
 *     browser does not also fire its native binding.
 *   • A handler that throws never breaks the workspace — we log and
 *     swallow.
 *
 * Map shape: `{ 'Alt+P': () => collect(), 'Alt+M': () => promise(), … }`
 */

export type ShortcutMap = Record<string, () => void>;

export function useCollectorShortcuts(map: ShortcutMap, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const combo = `Alt+${key}`;
      const handler = map[combo];
      if (!handler) return;
      e.preventDefault();
      try {
        handler();
      } catch (err) {
        // Never break the page on a handler bug
        // eslint-disable-next-line no-console
        console.error('[CollectionsWorkspace] shortcut failed', combo, err);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [map, enabled]);
}
