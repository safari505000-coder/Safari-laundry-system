import { Banknote, Loader2, RefreshCw, Users, Wallet, FileWarning } from 'lucide-react';
import { Button } from '@/modules/shared/components/ui/button';
import { cn } from '@/lib/utils';
import { formatKwdLabel } from '@/lib/kwd';
import type { OutstandingResponse } from '@/modules/call-center/outstanding/api/outstanding-api';
import type { CallCenterOperationsSummary } from '@/lib/api';

type Tone = 'primary' | 'danger' | 'success' | 'warning' | 'default';

type Props = {
  outstanding: OutstandingResponse | null;
  summary: CallCenterOperationsSummary | null;
  refreshing: boolean;
  onRefresh: () => void;
};

function formatKwd(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return '—';
  return formatKwdLabel(input);
}

function toneClasses(tone: Tone): string {
  switch (tone) {
    case 'primary':
      return 'text-primary';
    case 'danger':
      return 'text-rose-700 dark:text-rose-300';
    case 'success':
      return 'text-emerald-700 dark:text-emerald-300';
    case 'warning':
      return 'text-amber-700 dark:text-amber-300';
    default:
      return 'text-foreground';
  }
}

function Tile({
  label,
  value,
  caption,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  caption?: string;
  icon: typeof Wallet;
  tone?: Tone;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="truncate">{label}</span>
        <Icon className="size-4 shrink-0 opacity-70" aria-hidden />
      </div>
      <div
        className={cn(
          'mt-2 truncate font-heading text-2xl font-semibold tabular-nums sm:text-3xl',
          toneClasses(tone),
        )}
      >
        {value}
      </div>
      {caption ? (
        <div className="mt-1 truncate text-[11px] text-muted-foreground">
          {caption}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Sticky KPI strip sitting at the top of the Command Cockpit.
 *
 * Strict data rules (DO NOT BREAK):
 *  - `outstanding.totalDueKd` (string) is rendered as-is, only with
 *    locale-aware grouping; never recomputed.
 *  - `summary.debtRecoveredTodayKd` (string) is rendered as-is.
 *  - Customer / invoice counts come straight from the same response;
 *    the cockpit never sums rows manually.
 */
export function KpiStrip({
  outstanding,
  summary,
  refreshing,
  onRefresh,
}: Props) {
  if (
    outstanding &&
    typeof outstanding.totalDueKd !== 'string' &&
    typeof outstanding.totalDueKd !== 'number'
  ) {
    throw new Error('Invalid totalDue source');
  }

  const generated = outstanding?.generatedAt
    ? new Date(outstanding.generatedAt)
    : null;
  const generatedLabel = generated
    ? new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(generated)
    : null;

  const hasBlocked = (outstanding?.blockedCount ?? 0) > 0;

  return (
    <section
      className="sticky top-0 z-20 -mx-4 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/65 sm:-mx-6 sm:px-6"
      aria-label="مؤشرات لوحة قيادة الكول سنتر"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground/90">
          نظرة سريعة — لحظية
        </h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {generatedLabel ? (
            <span dir="ltr">آخر تحديث · {generatedLabel}</span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="تحديث المؤشرات"
            className="h-7 px-2"
          >
            {refreshing ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden />
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Tile
          label="إجمالي الذمم المدينة"
          value={outstanding ? formatKwd(outstanding.totalDueKd) : '—'}
          caption={
            outstanding
              ? `المصدر: ${outstanding.source}`
              : 'في انتظار البيانات…'
          }
          icon={Wallet}
          tone="danger"
        />
        <Tile
          label="عملاء عليهم مديونية"
          value={outstanding ? String(outstanding.totalCustomers) : '—'}
          caption={
            outstanding && hasBlocked
              ? `محظورون: ${outstanding.blockedCount}`
              : undefined
          }
          icon={Users}
          tone="primary"
        />
        <Tile
          label="تمّ تحصيله اليوم"
          value={summary ? formatKwd(summary.debtRecoveredTodayKd) : '—'}
          caption={
            summary
              ? `روابط معلّقة: ${summary.pendingLinksCount}`
              : 'في انتظار البيانات…'
          }
          icon={Banknote}
          tone="success"
        />
        <Tile
          label="فواتير غير مسدّدة"
          value={outstanding ? String(outstanding.totalInvoices) : '—'}
          caption={
            outstanding
              ? `متأخّرون: ${outstanding.lateCount} · حرجون: ${outstanding.riskCount}`
              : undefined
          }
          icon={FileWarning}
          tone="warning"
        />
      </div>
    </section>
  );
}
