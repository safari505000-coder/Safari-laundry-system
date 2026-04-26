import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { operatorHintSlugForPath } from '@/modules/shared/shell/operator-hint-slug';

type Props = {
  /** Use when the real URL does not encode the hint (e.g. `/pos` → driver vs manager). */
  pathOverride?: string;
};

/**
 * Short “for staff” note for the current route. Hidden when no translation
 * exists. `print:hidden` so A4 / receipt printouts stay clean.
 */
export function OperatorRouteHint({ pathOverride }: Props) {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const slug = operatorHintSlugForPath(pathOverride ?? pathname);
  if (!slug) return null;
  const key = `operatorHints.routes.${slug}`;
  const text = t(key);
  if (!text || text === key) return null;
  return (
    <div
      className="mb-4 flex gap-2.5 rounded-lg border border-sky-200/80 bg-sky-50/60 px-3 py-2.5 text-sm leading-relaxed text-sky-950 print:hidden dark:border-sky-900/50 dark:bg-sky-950/35 dark:text-sky-100"
      role="note"
    >
      <Info
        className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800/90 dark:text-sky-200/90">
          {t('operatorHints.badge', 'For staff')}
        </p>
        <p className="mt-1 text-sky-900/90 dark:text-sky-50/90">{text}</p>
      </div>
    </div>
  );
}
