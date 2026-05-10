import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Phone, Search, UserSearch } from 'lucide-react';
import { Input } from '@/modules/shared/components/ui/input';
import { cn } from '@/lib/utils';
import { formatKwdLabel, isPositiveKd } from '@/lib/kwd';
import { useCcCustomerSearch } from '../hooks/use-cc-customer-search';

type Props = {
  /** When provided, picking a result calls this instead of navigating. */
  onPick?: (customerId: string) => void;
  /** Override the default route used when `onPick` is absent. */
  basePath?: string;
  /** Auto-focus the input on mount (search-as-landing pattern). */
  autoFocus?: boolean;
  className?: string;
};

/**
 * Single-input customer search with a results dropdown.
 *
 * Behaviour:
 *   - Debounced (250ms) backend search hits `GET /api/customers?q=...`.
 *   - Shows a dropdown panel only while focused AND the query is ≥ 2 chars.
 *   - Keyboard: ArrowUp/Down highlights, Enter picks, Esc closes.
 *   - Clicking outside closes the panel.
 *   - Picking either calls `onPick(customerId)` or navigates to
 *     `<basePath>/<customerId>` (default `/cc/customers`).
 */
export function CustomerSearch({
  onPick,
  basePath = '/cc/customers',
  autoFocus = false,
  className,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { hits, loading, error, isEmptyAllowedQuery } = useCcCustomerSearch(query);

  // Clamp the highlighted index whenever the result set shrinks. This
  // is a derived value — keeping it in render avoids the cascading
  // re-render that resetting in a useEffect would trigger.
  const safeHighlightIdx = useMemo(
    () => (hits.length === 0 ? 0 : Math.min(highlightIdx, hits.length - 1)),
    [highlightIdx, hits.length],
  );

  // Click-outside handling.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        e.target instanceof Node &&
        !containerRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const choose = (customerId: string) => {
    setOpen(false);
    setQuery('');
    if (onPick) {
      onPick(customerId);
      return;
    }
    navigate(`${basePath}/${customerId}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || hits.length === 0) {
      if (e.key === 'ArrowDown' && hits.length > 0) {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      setHighlightIdx((i) => Math.min(hits.length - 1, i + 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setHighlightIdx((i) => Math.max(0, i - 1));
      e.preventDefault();
    } else if (e.key === 'Enter') {
      const hit = hits[safeHighlightIdx];
      if (hit) choose(hit.id);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      setOpen(false);
      e.preventDefault();
    }
  };

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground ltr:left-3 rtl:right-3"
          aria-hidden
        />
        <Input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('callCenterDashboard.search.placeholder', {
            defaultValue: 'ابحث برقم الهاتف أو الاسم أو معرف العميل…',
          })}
          aria-label={t('callCenterDashboard.search.aria', {
            defaultValue: 'بحث عن عميل',
          })}
          className="h-12 ltr:pl-10 rtl:pr-10"
          autoComplete="off"
          spellCheck={false}
        />
        {loading ? (
          <Loader2
            className="absolute top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground ltr:right-3 rtl:left-3"
            aria-hidden
          />
        ) : null}
      </div>

      {open && (query.trim().length >= 2 || error) ? (
        <div
          role="listbox"
          aria-label={t('callCenterDashboard.search.resultsAria', {
            defaultValue: 'نتائج البحث',
          })}
          className="absolute inset-x-0 top-[calc(100%+4px)] z-30 max-h-80 overflow-auto rounded-lg border border-border bg-popover shadow-lg"
        >
          {error ? (
            <div className="p-3 text-sm text-destructive">{error}</div>
          ) : hits.length === 0 && isEmptyAllowedQuery ? (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <UserSearch className="size-4" aria-hidden />
              {t('callCenterDashboard.search.empty', {
                defaultValue: 'لا توجد نتائج',
              })}
            </div>
          ) : (
            <ul className="py-1">
              {hits.map((hit, idx) => {
                const hasDebt = isPositiveKd(hit.totalDebtKd);
                const active = idx === safeHighlightIdx;
                return (
                  <li key={hit.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setHighlightIdx(idx)}
                      onClick={() => choose(hit.id)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 px-3 py-2 text-start transition-colors',
                        active
                          ? 'bg-muted text-foreground'
                          : 'text-foreground/90 hover:bg-muted/60',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {hit.displayName}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <Phone className="size-3" aria-hidden />
                          <span className="truncate" dir="ltr">
                            {hit.phone}
                          </span>
                          {hit.phone2 ? (
                            <span className="truncate opacity-70" dir="ltr">
                              · {hit.phone2}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {hasDebt ? (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                          {formatKwdLabel(hit.totalDebtKd)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
