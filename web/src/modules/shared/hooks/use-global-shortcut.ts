import { useEffect } from 'react';

/**
 * V20.9 — Phase 4 cross-page keyboard shortcut hook.
 *
 * Distinct from `modules/collections/hooks/use-collector-shortcuts`
 * — that one is workspace-scoped (Alt-letter actions). This hook
 * registers GLOBAL shortcuts (Ctrl+K, ?, Esc, etc.) that should
 * fire from anywhere in the app.
 *
 * # Behaviour
 *
 *   • Listens on `window keydown` capture.
 *   • Skips when the focused element is an input/textarea/select
 *     UNLESS the shortcut explicitly opts into `allowInInput`.
 *   • Calls `preventDefault()` only if the handler fires.
 *
 * # Modifier semantics
 *
 *   `mod` = Ctrl on Windows/Linux, Cmd on macOS. Use this for
 *   palette-style shortcuts (Ctrl+K / Cmd+K).
 */
export type ShortcutSpec = {
  /** Key (case-insensitive). Use `?` for shift+/. */
  key: string;
  /** Modifier — `mod` is Ctrl or Cmd. */
  mod?: 'mod' | 'shift' | 'alt' | null;
  /** Allow firing while an input has focus. */
  allowInInput?: boolean;
  /** Handler — return `true` to also call preventDefault. */
  handler: (e: KeyboardEvent) => void | boolean;
};

const isMac = typeof navigator !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

function modPressed(e: KeyboardEvent, mod?: ShortcutSpec['mod']): boolean {
  if (!mod) return !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
  if (mod === 'mod') return isMac ? e.metaKey : e.ctrlKey;
  if (mod === 'shift') return e.shiftKey;
  if (mod === 'alt') return e.altKey;
  return false;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useGlobalShortcut(spec: ShortcutSpec): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() !== spec.key.toLowerCase()) return;
      if (!modPressed(e, spec.mod)) return;
      if (!spec.allowInInput && isEditableTarget(e.target)) return;
      const result = spec.handler(e);
      if (result !== false) e.preventDefault();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKey, {
        capture: true,
      } as EventListenerOptions);
    };
  }, [spec.key, spec.mod, spec.allowInInput, spec.handler, spec]);
}
