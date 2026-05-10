import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PaletteCommand } from './command-types';
import { rankCommands } from './rank-commands';

/**
 * V20.9 — Phase 4 Universal Command Palette.
 *
 * Cross-domain quick-launcher modeled on macOS Spotlight /
 * VSCode Cmd-Shift-P / Linear's `K`.
 *
 * # Behaviour
 *
 *   • Default trigger: `Ctrl/Cmd + K`. Esc / overlay click close it.
 *   • Empty query renders the recent + suggested actions.
 *   • Filtering is fuzzy: case-insensitive substring match against
 *     `title` + `subtitle` + `keywords`. Stable: same query →
 *     same ordering.
 *   • Arrow keys navigate; Enter executes the highlighted command.
 *   • Recent commands persist via the supplied `recentStore` hook
 *     (default: in-memory) so individual operators can keep a
 *     stable shortcut history without us touching localStorage
 *     here.
 *
 * # Accessibility
 *
 *   • `role="dialog" aria-modal="true"`.
 *   • Search input is auto-focused on open.
 *   • Active result has `aria-selected="true"` for screen readers.
 *
 * # Server-canonical
 *
 *   The palette ITSELF performs zero financial work. It dispatches
 *   `command.run(ctx)` callbacks; the called code goes through
 *   the canonical APIs as usual.
 */

export type { PaletteCommand } from './command-types';

export type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  commands: ReadonlyArray<PaletteCommand>;
  /** Pre-rank a subset; usually filled by recent + critical commands. */
  defaultIds?: ReadonlyArray<string>;
  /** Used by tests to inject a deterministic clock. */
  nowMs?: () => number;
  placeholder?: string;
};

export function CommandPalette(props: CommandPaletteProps): ReactElement | null {
  const { open, onClose, commands, defaultIds, placeholder } = props;
  // Using `open` as a key resets internal state without a setState-in-effect
  // call (which violates `react-hooks/set-state-in-effect`). Each open cycle
  // mounts a fresh inner component; the user-visible behaviour is identical.
  if (!open) return null;
  return (
    <CommandPaletteInner
      key={String(open)}
      onClose={onClose}
      commands={commands}
      defaultIds={defaultIds}
      placeholder={placeholder}
    />
  );
}

type InnerProps = Omit<CommandPaletteProps, 'open'>;

function CommandPaletteInner(props: InnerProps): ReactElement {
  const { onClose, commands, defaultIds, placeholder } = props;
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    queueMicrotask(() => inputRef.current?.focus());
  }, []);

  const filtered = useMemo(() => {
    return rankCommands(commands, query, defaultIds);
  }, [commands, query, defaultIds]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
        return;
      }
      if (e.key === 'Enter' && filtered[highlighted]) {
        e.preventDefault();
        const cmd = filtered[highlighted];
        const result = cmd.run({ query });
        Promise.resolve(result).finally(() => onClose());
      }
    },
    [filtered, highlighted, onClose, query],
  );

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-3 pt-[15vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        onKeyDown={onKeyDown}
        className="w-full max-w-xl overflow-hidden rounded-lg border bg-background shadow-2xl"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlighted(0);
          }}
          placeholder={placeholder ?? 'اكتب أمرًا أو ابحث... (Ctrl+K)'}
          aria-label="Command Palette search"
          className="w-full border-b bg-transparent px-4 py-3 text-base outline-none"
          spellCheck={false}
          autoComplete="off"
        />
        <ul role="listbox" className="max-h-[55vh] overflow-y-auto">
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              No matches.
            </li>
          )}
          {filtered.map((cmd, idx) => (
            <li
              key={cmd.id}
              role="option"
              aria-selected={idx === highlighted}
              data-cmd-id={cmd.id}
              className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm ${
                idx === highlighted ? 'bg-muted' : ''
              }`}
              onMouseEnter={() => setHighlighted(idx)}
              onClick={() => {
                const result = cmd.run({ query });
                Promise.resolve(result).finally(() => onClose());
              }}
            >
              <div className="flex items-center gap-2">
                {cmd.critical ? (
                  <span
                    aria-hidden
                    className="inline-block size-2 rounded-full bg-red-500"
                  />
                ) : null}
                <div className="flex flex-col">
                  <span className="font-medium">{cmd.title}</span>
                  {cmd.subtitle ? (
                    <span className="text-xs text-muted-foreground">
                      {cmd.subtitle}
                    </span>
                  ) : null}
                </div>
              </div>
              {cmd.shortcut ? (
                <kbd className="rounded border px-1.5 py-0.5 text-xs">
                  {cmd.shortcut}
                </kbd>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

