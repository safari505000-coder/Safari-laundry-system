import { type ReactElement } from 'react';
import { formatKwdLabel } from '@/lib/kwd';

/**
 * V20.6 — Phase 6B TimelineCard.
 *
 * A single row from the Customer Financial Timeline. The timeline is
 * SERVER-DERIVED from the canonical Journal — this component is
 * intentionally dumb and only renders presentational props.
 */

export type TimelineKind =
  | 'INVOICE_ISSUED'
  | 'PAYMENT_CAPTURED'
  | 'PARTIAL_PAYMENT_CAPTURED'
  | 'INVOICE_REVERSED'
  | 'REFUND_CREATED'
  | 'WALLET_ADJUSTED'
  | 'PROMISE_CREATED'
  | 'PROMISE_KEPT'
  | 'PROMISE_BROKEN'
  | 'COLLECTION_ESCALATED'
  | 'FRAUD_ALERT'
  | 'NOTE'
  | 'OTHER';

const KIND_DOT: Record<TimelineKind, string> = {
  INVOICE_ISSUED: 'bg-blue-500',
  PAYMENT_CAPTURED: 'bg-emerald-500',
  PARTIAL_PAYMENT_CAPTURED: 'bg-emerald-400',
  INVOICE_REVERSED: 'bg-amber-500',
  REFUND_CREATED: 'bg-amber-400',
  WALLET_ADJUSTED: 'bg-violet-500',
  PROMISE_CREATED: 'bg-sky-500',
  PROMISE_KEPT: 'bg-emerald-600',
  PROMISE_BROKEN: 'bg-rose-500',
  COLLECTION_ESCALATED: 'bg-orange-500',
  FRAUD_ALERT: 'bg-red-600',
  NOTE: 'bg-slate-400',
  OTHER: 'bg-slate-300',
};

export type TimelineCardProps = {
  kind: TimelineKind;
  occurredAt: string | Date;
  title: string;
  description?: string | null;
  amountKd?: string | null;
  /** Server reference (sourceRef) for forensic traceability */
  reference?: string | null;
  actorName?: string | null;
  locale?: 'en' | 'ar';
  className?: string;
};

export function TimelineCard(props: TimelineCardProps): ReactElement {
  const isAr = (props.locale ?? 'ar') === 'ar';
  const occurred =
    typeof props.occurredAt === 'string' ? new Date(props.occurredAt) : props.occurredAt;
  return (
    <article
      className={`relative grid grid-cols-[auto_1fr] items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 ${
        props.className ?? ''
      }`}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="flex flex-col items-center pt-1">
        <span
          aria-hidden
          className={`h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${
            KIND_DOT[props.kind]
          }`}
        />
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
            {props.title}
          </h4>
          <time
            dateTime={occurred.toISOString()}
            className="shrink-0 text-[0.65rem] uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            {occurred.toLocaleString(isAr ? 'ar' : 'en')}
          </time>
        </div>
        {props.description ? (
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{props.description}</p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[0.7rem] text-slate-500 dark:text-slate-400">
          {props.amountKd ? (
            <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
              {formatKwdLabel(props.amountKd)}
            </span>
          ) : null}
          {props.actorName ? <span>· {props.actorName}</span> : null}
          {props.reference ? (
            <code className="rounded bg-slate-100 px-1 py-0.5 text-[0.6rem] dark:bg-slate-800">
              {props.reference}
            </code>
          ) : null}
        </div>
      </div>
    </article>
  );
}
