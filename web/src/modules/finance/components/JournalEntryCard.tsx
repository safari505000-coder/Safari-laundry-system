import { type ReactElement } from 'react';
import { formatKwdAmount } from '@/lib/kwd';

/**
 * V20.7 — Phase 3 JournalEntryCard.
 *
 * Compact, single-row "ledger event" card for inline timeline use.
 * For the full debit/credit table, prefer `JournalEntryView`. This
 * component is the at-a-glance variant.
 */

export type JournalEntryCardProps = {
  entryId: string | number;
  source: string;
  effectiveAt: string | Date;
  /** Net amount in KD (server-canonical string). */
  amountKd: string;
  /** Sign indicator — 'debit' tints rose, 'credit' tints emerald. */
  side: 'debit' | 'credit';
  isReversal?: boolean;
  branchName?: string | null;
  description?: string | null;
  className?: string;
};

export function JournalEntryCard(props: JournalEntryCardProps): ReactElement {
  const occurred =
    typeof props.effectiveAt === 'string' ? new Date(props.effectiveAt) : props.effectiveAt;
  const sideKlass =
    props.side === 'debit'
      ? 'text-rose-700 dark:text-rose-300'
      : 'text-emerald-700 dark:text-emerald-300';
  return (
    <article
      className={`flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900 ${
        props.className ?? ''
      }`}
      aria-label={`Journal entry ${props.entryId} — ${props.source}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.65rem] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            JE-{String(props.entryId)}
          </code>
          <span className="font-semibold uppercase text-slate-700 dark:text-slate-200">
            {props.source}
          </span>
          {props.isReversal ? (
            <span className="rounded bg-amber-100 px-1.5 py-0 text-[0.6rem] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              REVERSAL
            </span>
          ) : null}
          {props.branchName ? (
            <span className="text-[0.65rem] text-slate-500 dark:text-slate-400">
              · {props.branchName}
            </span>
          ) : null}
        </div>
        {props.description ? (
          <p className="mt-0.5 truncate text-[0.7rem] text-slate-600 dark:text-slate-300">
            {props.description}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 text-end">
        <span className={`text-sm font-bold tabular-nums ${sideKlass}`}>
          {props.side === 'debit' ? '−' : '+'}
          {formatKwdAmount(props.amountKd)}
        </span>
        <time className="block text-[0.6rem] text-slate-500 dark:text-slate-400">
          {occurred.toLocaleString('en')}
        </time>
      </div>
    </article>
  );
}
