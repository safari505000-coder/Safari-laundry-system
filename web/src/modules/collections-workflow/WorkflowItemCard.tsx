import React from 'react';
import { formatKwdLabel } from '@/lib/kwd';
import type { WorkflowItem, WorkflowKind, WorkflowPriority, WorkflowStatus } from './types';

void React;

/**
 * V23.1 Phase 7 — Operational workflow card.
 *
 * Visibility-only operator card for a single callback/promise/escalation
 * row inside the cockpit lanes. It renders a snapshot label for the
 * money side via `formatKwdLabel(amountKdSnapshot)` and NEVER parses
 * the value into a number.
 */

export interface WorkflowItemCardProps {
  item: WorkflowItem;
  /** Optional active operator id, used to dim cards owned by others. */
  currentOperatorId?: string | null;
  onOpen?: (item: WorkflowItem) => void;
  onClaim?: (item: WorkflowItem) => void;
  onRelease?: (item: WorkflowItem) => void;
  onComplete?: (item: WorkflowItem) => void;
  onBreak?: (item: WorkflowItem) => void;
  onCancel?: (item: WorkflowItem) => void;
  locale?: 'en' | 'ar';
}

const KIND_LABELS: Record<WorkflowKind, { ar: string; en: string }> = {
  CALLBACK: { ar: 'اتصال مرتجع', en: 'Callback' },
  PROMISE: { ar: 'وعد بالسداد', en: 'Promise' },
  ESCALATION: { ar: 'تصعيد', en: 'Escalation' },
};

const STATUS_LABELS: Record<WorkflowStatus, { ar: string; en: string }> = {
  OPEN: { ar: 'مفتوح', en: 'Open' },
  IN_PROGRESS: { ar: 'قيد التنفيذ', en: 'In progress' },
  COMPLETED: { ar: 'مكتمل', en: 'Completed' },
  BROKEN: { ar: 'وعد منكوث', en: 'Broken' },
  CANCELLED: { ar: 'ملغى', en: 'Cancelled' },
};

const PRIORITY_LABELS: Record<WorkflowPriority, { ar: string; en: string; tone: string }> = {
  LOW: { ar: 'منخفض', en: 'Low', tone: 'bg-slate-200 text-slate-700' },
  NORMAL: { ar: 'عادي', en: 'Normal', tone: 'bg-sky-100 text-sky-800' },
  HIGH: { ar: 'مرتفع', en: 'High', tone: 'bg-amber-100 text-amber-800' },
  URGENT: { ar: 'عاجل', en: 'Urgent', tone: 'bg-rose-100 text-rose-800' },
};

function statusTone(status: WorkflowStatus): string {
  switch (status) {
    case 'OPEN':
      return 'bg-emerald-100 text-emerald-800';
    case 'IN_PROGRESS':
      return 'bg-indigo-100 text-indigo-800';
    case 'COMPLETED':
      return 'bg-slate-200 text-slate-700';
    case 'BROKEN':
      return 'bg-rose-100 text-rose-800';
    case 'CANCELLED':
      return 'bg-zinc-100 text-zinc-600';
  }
}

function relativeTime(targetIso: string | null, locale: 'en' | 'ar', now: number = Date.now()): string {
  if (!targetIso) return '';
  const t = Date.parse(targetIso);
  if (Number.isNaN(t)) return '';
  const deltaMs = t - now;
  const absMin = Math.round(Math.abs(deltaMs) / 60_000);
  const absHr = Math.round(Math.abs(deltaMs) / 3_600_000);
  const absDay = Math.round(Math.abs(deltaMs) / 86_400_000);
  const isAr = locale === 'ar';
  if (absMin < 60) {
    return deltaMs >= 0
      ? isAr
        ? `بعد ${absMin}د`
        : `in ${absMin}m`
      : isAr
        ? `قبل ${absMin}د`
        : `${absMin}m ago`;
  }
  if (absHr < 24) {
    return deltaMs >= 0
      ? isAr
        ? `بعد ${absHr}س`
        : `in ${absHr}h`
      : isAr
        ? `قبل ${absHr}س`
        : `${absHr}h ago`;
  }
  return deltaMs >= 0
    ? isAr
      ? `بعد ${absDay} يوم`
      : `in ${absDay}d`
    : isAr
      ? `قبل ${absDay} يوم`
      : `${absDay}d ago`;
}

export function WorkflowItemCard(props: WorkflowItemCardProps): React.ReactElement {
  const { item, currentOperatorId, locale = 'ar' } = props;
  const isAr = locale === 'ar';
  const ownedBySomeoneElse =
    Boolean(item.ownedById) &&
    Boolean(currentOperatorId) &&
    item.ownedById !== currentOperatorId;
  const isMine = Boolean(item.ownedById && item.ownedById === currentOperatorId);

  const dueRelative = relativeTime(item.scheduledAt, locale);
  const isOverdue =
    item.scheduledAt != null &&
    Date.parse(item.scheduledAt) < Date.now() &&
    item.status !== 'COMPLETED' &&
    item.status !== 'CANCELLED';

  return (
    <article
      data-testid="workflow-item-card"
      data-kind={item.kind}
      data-status={item.status}
      data-owned-by-me={isMine ? 'true' : 'false'}
      className={`group relative flex flex-col gap-2 rounded-xl border bg-white p-3 text-sm shadow-sm transition hover:shadow-md dark:bg-slate-900 ${
        ownedBySomeoneElse
          ? 'border-amber-200 opacity-80 dark:border-amber-700'
          : isOverdue
            ? 'border-rose-200 dark:border-rose-700'
            : 'border-slate-200 dark:border-slate-700'
      }`}
      aria-label={`${KIND_LABELS[item.kind][isAr ? 'ar' : 'en']}: ${item.customerNameSnapshot ?? item.customerId}`}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${statusTone(item.status)}`}
            >
              {STATUS_LABELS[item.status][isAr ? 'ar' : 'en']}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${PRIORITY_LABELS[item.priority].tone}`}
            >
              {PRIORITY_LABELS[item.priority][isAr ? 'ar' : 'en']}
            </span>
          </div>
          <h4 className="mt-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
            {item.customerNameSnapshot ?? item.customerId}
          </h4>
        </div>
        {item.amountKdSnapshot ? (
          <div className="shrink-0 text-end">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {isAr ? 'مبلغ مرجعي' : 'Reference'}
            </div>
            <div
              className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100"
              data-testid="workflow-amount-snapshot"
              title={
                isAr
                  ? 'مبلغ مرجعي فقط — التسوية المالية تتم من خلال خدمة المدفوعات الرسمية'
                  : 'Reference label only — actual settlement runs through the canonical payment service'
              }
            >
              {formatKwdLabel(item.amountKdSnapshot)}
            </div>
          </div>
        ) : null}
      </header>

      {item.notes ? (
        <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{item.notes}</p>
      ) : null}

      <div className="flex items-center justify-between text-[0.65rem] text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          {item.scheduledAt ? (
            <span
              className={isOverdue ? 'font-semibold text-rose-700 dark:text-rose-400' : undefined}
              data-testid="workflow-due-relative"
            >
              {isOverdue
                ? isAr
                  ? `متأخر ${dueRelative}`
                  : `Overdue ${dueRelative}`
                : dueRelative}
            </span>
          ) : (
            <span>{isAr ? 'بدون موعد' : 'No schedule'}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {item.ownedByName ? (
            <span
              className={
                isMine
                  ? 'rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
              }
              data-testid="workflow-owner-pill"
            >
              {isMine ? (isAr ? 'بيدك' : 'You') : item.ownedByName}
            </span>
          ) : (
            <span className="text-slate-400">{isAr ? 'بدون مالك' : 'Unclaimed'}</span>
          )}
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-1.5">
        {props.onOpen ? (
          <button
            type="button"
            onClick={() => props.onOpen?.(item)}
            className="rounded-md border border-slate-300 px-2 py-1 text-[0.7rem] font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            {isAr ? 'فتح' : 'Open'}
          </button>
        ) : null}
        {!item.ownedById && props.onClaim ? (
          <button
            type="button"
            onClick={() => props.onClaim?.(item)}
            className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[0.7rem] font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200"
          >
            {isAr ? 'استلام' : 'Claim'}
          </button>
        ) : null}
        {isMine && props.onRelease ? (
          <button
            type="button"
            onClick={() => props.onRelease?.(item)}
            className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[0.7rem] font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
          >
            {isAr ? 'تخلٍّ' : 'Release'}
          </button>
        ) : null}
        {props.onComplete ? (
          <button
            type="button"
            onClick={() => props.onComplete?.(item)}
            className="rounded-md border border-slate-300 px-2 py-1 text-[0.7rem] font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            {isAr ? 'إكمال' : 'Complete'}
          </button>
        ) : null}
        {item.kind === 'PROMISE' && props.onBreak ? (
          <button
            type="button"
            onClick={() => props.onBreak?.(item)}
            className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-[0.7rem] font-medium text-rose-800 hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200"
          >
            {isAr ? 'وعد منكوث' : 'Broken'}
          </button>
        ) : null}
        {props.onCancel ? (
          <button
            type="button"
            onClick={() => props.onCancel?.(item)}
            className="rounded-md border border-slate-300 px-2 py-1 text-[0.7rem] font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
        ) : null}
      </footer>
    </article>
  );
}
