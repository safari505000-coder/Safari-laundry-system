import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Stage-F Cosmetic — Dark Mode.
 *
 * The CSS layer already ships both light (`:root`) and dark (`.dark`)
 * token sets in `index.css` and every shadcn component consumes those
 * tokens. All this provider has to do is flip the `dark` class on the
 * <html> element and remember the user preference.
 *
 * Three modes are supported:
 *   - `light` (default) — force the light palette. This is the shipped
 *     default across every Safari role per the owner's 2026-04 product
 *     call: the operational UI is designed for a bright retail / cash
 *     floor context, so dark mode is opt-in rather than opt-out.
 *   - `dark`  — force the dark palette.
 *   - `system` — follow `prefers-color-scheme` and react to live OS
 *     changes via `matchMedia`.
 *
 * The provider synchronously applies the right class on mount (before
 * React commits) via a `useLayoutEffect`-equivalent to avoid a flash
 * of unthemed content. It also listens to `storage` events so opening
 * two tabs side-by-side keeps them in sync.
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'safari_erp_theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const DEFAULT_THEME: ThemeMode = 'light';

/**
 * One-shot migration stamp. When the owner flipped the shipped default
 * to `'light'` (2026-04), devices that had already been running with
 * the old `'system'` default would keep resolving to the OS palette —
 * which on Arabic-Windows installs is overwhelmingly dark. To make
 * sure every role lands on light mode after the upgrade we reset the
 * stored preference to `'light'` once and mark that migration done,
 * so a user who later picks `dark` or `system` explicitly is never
 * reset again.
 */
const LIGHT_MIGRATION_KEY = 'safari_erp_theme_migrated_to_light_v1';

function runLightModeMigration(): void {
  try {
    if (localStorage.getItem(LIGHT_MIGRATION_KEY) === '1') return;
    localStorage.setItem(STORAGE_KEY, DEFAULT_THEME);
    localStorage.setItem(LIGHT_MIGRATION_KEY, '1');
  } catch {
    /* ignore — private-mode / storage disabled */
  }
}

type ThemeContextValue = {
  /** What the user picked (light / dark / system). */
  theme: ThemeMode;
  /** What is actually displayed right now. Never `'system'`. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
  /** Cycles light → dark → system → light. */
  cycleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}

function writeStoredTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  try {
    return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyDocumentTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

function resolve(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? getSystemTheme() : mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => readStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolve(readStoredTheme()),
  );

  useEffect(() => {
    const r = resolve(theme);
    setResolvedTheme(r);
    applyDocumentTheme(r);
    writeStoredTheme(theme);
  }, [theme]);

  // Live-track OS preference changes when in `system` mode.
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia(DARK_QUERY);
    const handler = () => {
      const r = getSystemTheme();
      setResolvedTheme(r);
      applyDocumentTheme(r);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // Cross-tab sync via `storage` events.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      if (e.newValue === 'light' || e.newValue === 'dark' || e.newValue === 'system') {
        setThemeState(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      if (current === 'light') return 'dark';
      if (current === 'dark') return 'system';
      return 'light';
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme, cycleTheme }),
    [theme, resolvedTheme, setTheme, cycleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within <ThemeProvider>');
  }
  return ctx;
}

/**
 * Inline script that runs *before* React hydrates. Call this once
 * from the HTML entry or from `main.tsx` (pre-render) so the correct
 * class is already on <html> when the first paint happens.
 *
 * Keep this tiny — it runs as a blocking script on every page load.
 */
export function bootstrapTheme(): void {
  try {
    runLightModeMigration();
    const stored = localStorage.getItem(STORAGE_KEY);
    const mode: ThemeMode =
      stored === 'light' || stored === 'dark' || stored === 'system'
        ? stored
        : DEFAULT_THEME;
    const resolved: ResolvedTheme =
      mode === 'system'
        ? window.matchMedia(DARK_QUERY).matches
          ? 'dark'
          : 'light'
        : mode;
    applyDocumentTheme(resolved);
  } catch {
    /* ignore — we'll recover once the provider mounts */
  }
}
