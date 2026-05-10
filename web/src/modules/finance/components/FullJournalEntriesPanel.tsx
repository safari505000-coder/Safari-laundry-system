import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { formatKwdAmount, isPositiveKd } from '@/lib/kwd';
import { cn } from '@/lib/utils';

/**
 * V22 Phase 6 — full balanced double-entry journal panel.
 *
 * Renders the response of `/api/finance/journal/customers/:id/full-entries`
 * verbatim. Every entry shows ALL of its lines (debit + credit per
 * account) plus a per-entry trial-balance check (Σ Dr = Σ Cr) so
 * operators can see the actual double-entry shape — not just the AR
 * slice projected by `getCustomerStatement`.
 *
 * The component is render-only:
 *   • no money math
 *   • no derived running balance
 *   • all KWD values come pre-formatted by `formatKwdAmount`
 *
 * It also never owns financial truth — it accepts the canonical
 * payload from the parent and renders it. This keeps it compatible
 * with the V21 realtime invariant (cache invalidation only, no
 * direct payload-to-state mutation of money).
 */

export type FullJournalLine = {
  accountCode: string;
  accountName: string;
  debitKd: string;
  creditKd: string;
};

export type FullJournalEntry = {
  entryId: string;
  source: string;
  sourceRef: string;
  description: string;
  createdAt: string;
  totalDebitKd: string;
  totalCreditKd: string;
  balanced: boolean;
  lines: FullJournalLine[];
};

const ARABIC_ACCOUNT_NAME: Record<string, string> = {
  CASH: 'الصندوق (نقدي)',
  BANK_KNET: 'البنك — كي‌نت',
  BANK_ONLINE: 'البنك — أونلاين',
  ACCOUNTS_RECEIVABLE: 'ذمم العملاء',
  WALLET_LIABILITY: 'رصيد عملاء (التزام)',
  REVENUE: 'إيرادات',
  REVENUE_RETURNS: 'مرتجعات الإيرادات',
  ADJUSTMENTS: 'تسويات',
  DEBT_DISCOUNTS: 'خصومات الديون (مصروف)',
  PROMOTIONAL_EXPENSE: 'مصروف ترويجي',
};

function arabicAccountLabel(code: string, name: string): string {
  return ARABIC_ACCOUNT_NAME[name] ?? `${name} (${code})`;
}

function FullJournalEntryRow({
  entry,
  defaultOpen,
}: {
  entry: FullJournalEntry;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const date = new Date(entry.createdAt);

  return (
    <article
      data-testid="full-journal-entry"
      className={cn(
        'rounded-xl border bg-card shadow-sm transition-shadow',
        entry.balanced ? '' : 'border-destructive/60 bg-destructive/5',
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 rounded-t-xl px-4 py-3 text-start hover:bg-muted/40"
      >
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">{entry.description}</span>
          <span className="text-xs text-muted-foreground">
            {date.toLocaleString()} · <span dir="ltr">{entry.sourceRef}</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
              entry.balanced
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-destructive/10 text-destructive',
            )}
          >
            {entry.balanced ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
            {entry.balanced ? 'متوازن' : 'غير متوازن'}
          </span>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {open ? (
        <div className="border-t">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-start">الحساب</th>
                <th className="px-4 py-2 text-end">مدين (د.ك)</th>
                <th className="px-4 py-2 text-end">دائن (د.ك)</th>
              </tr>
            </thead>
            <tbody>
              {entry.lines.map((line, idx) => (
                <tr key={`${entry.entryId}-${idx}`} className="border-t">
                  <td className="px-4 py-2">
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {arabicAccountLabel(line.accountCode, line.accountName)}
                      </span>
                      <span
                        className="text-[11px] text-muted-foreground"
                        dir="ltr"
                      >
                        {line.accountCode} · {line.accountName}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-end font-semibold tabular-nums">
                    {isPositiveKd(line.debitKd)
                      ? formatKwdAmount(line.debitKd)
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-end font-semibold tabular-nums">
                    {isPositiveKd(line.creditKd)
                      ? formatKwdAmount(line.creditKd)
                      : '—'}
                  </td>
                </tr>
              ))}
              <tr className="border-t bg-muted/30">
                <td className="px-4 py-2 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  الإجمالي
                </td>
                <td className="px-4 py-2 text-end text-sm font-bold tabular-nums">
                  {formatKwdAmount(entry.totalDebitKd)}
                </td>
                <td className="px-4 py-2 text-end text-sm font-bold tabular-nums">
                  {formatKwdAmount(entry.totalCreditKd)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
  );
}

export function FullJournalEntriesPanel({
  entries,
  loading,
}: {
  entries: FullJournalEntry[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        جاري تحميل القيود الكاملة...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        لا توجد قيود مزدوجة لهذا العميل.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, idx) => (
        <FullJournalEntryRow
          key={entry.entryId}
          entry={entry}
          defaultOpen={idx === entries.length - 1}
        />
      ))}
    </div>
  );
}
