import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CreateWorkflowItemInput, WorkflowKind, WorkflowPriority } from './types';

void React;

/**
 * V23.1 Phase 7 — Quick-add modal for callbacks / promises / escalations.
 *
 * The modal is INTENTIONALLY a thin form with no money math:
 *   • The KWD field is a free-text snapshot label, validated against the
 *     canonical KWD shape regex but NEVER parsed into a Number.
 *   • The "schedule" field is a native datetime-local input, normalized
 *     to ISO before submission.
 *   • Submission delegates to the parent — the modal does not own
 *     network state.
 */

export interface WorkflowQuickAddModalProps {
  open: boolean;
  initialKind: WorkflowKind;
  customerId: string | null;
  customerNameSnapshot?: string | null;
  branchId?: string | null;
  locale?: 'en' | 'ar';
  onClose: () => void;
  onSubmit: (input: CreateWorkflowItemInput) => Promise<void> | void;
}

const KWD_RE = /^\d+(\.\d{1,4})?$/;

function isoFromLocalInput(local: string): string | undefined {
  if (!local) return undefined;
  const t = Date.parse(local);
  if (Number.isNaN(t)) return undefined;
  return new Date(t).toISOString();
}

const LABELS = {
  ar: {
    title: { CALLBACK: 'جدولة اتصال مرتجع', PROMISE: 'تسجيل وعد بالسداد', ESCALATION: 'تصعيد العميل' },
    customer: 'العميل',
    schedule: 'الموعد',
    amount: 'المبلغ المرجعي (د.ك)',
    amountHint: 'مبلغ مرجعي للعرض فقط — التسوية تتم من خلال خدمة المدفوعات',
    priority: 'الأولوية',
    notes: 'ملاحظة',
    submit: 'حفظ',
    cancel: 'إلغاء',
    invalidAmount: 'صيغة المبلغ غير صحيحة (مثال: 12.500)',
  },
  en: {
    title: { CALLBACK: 'Schedule callback', PROMISE: 'Record promise', ESCALATION: 'Escalate customer' },
    customer: 'Customer',
    schedule: 'Schedule',
    amount: 'Reference amount (KWD)',
    amountHint: 'Reference label only — settlement runs through canonical payments',
    priority: 'Priority',
    notes: 'Notes',
    submit: 'Save',
    cancel: 'Cancel',
    invalidAmount: 'Amount must look like 12.500',
  },
} as const;

const PRIORITIES: WorkflowPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export function WorkflowQuickAddModal(props: WorkflowQuickAddModalProps): React.ReactElement | null {
  const isAr = (props.locale ?? 'ar') === 'ar';
  const labels = isAr ? LABELS.ar : LABELS.en;
  const titleId = useId();
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  const [scheduledAt, setScheduledAt] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [priority, setPriority] = useState<WorkflowPriority>('NORMAL');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) {
      setScheduledAt('');
      setAmount('');
      setPriority('NORMAL');
      setNotes('');
      setSubmitting(false);
      setSubmitError(null);
      return;
    }
    const id = window.setTimeout(() => firstFieldRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [props.open, props.initialKind]);

  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.open, props.onClose]);

  const amountValid = useMemo(() => {
    if (props.initialKind !== 'PROMISE') return true;
    if (amount === '') return true;
    return KWD_RE.test(amount);
  }, [amount, props.initialKind]);

  if (!props.open) return null;
  if (!props.customerId) return null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!amountValid) {
      setSubmitError(labels.invalidAmount);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const input: CreateWorkflowItemInput = {
        kind: props.initialKind,
        customerId: props.customerId!,
        customerNameSnapshot: props.customerNameSnapshot ?? undefined,
        branchId: props.branchId ?? undefined,
        scheduledAt: isoFromLocalInput(scheduledAt),
        amountKdSnapshot:
          props.initialKind === 'PROMISE' && amount !== '' ? amount : undefined,
        priority,
        notes: notes.trim() === '' ? undefined : notes.trim(),
      };
      await props.onSubmit(input);
      props.onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'submit_failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl dark:bg-slate-900"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        <header className="mb-3 flex items-center justify-between">
          <h3 id={titleId} className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {labels.title[props.initialKind]}
          </h3>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label={labels.cancel}
          >
            ×
          </button>
        </header>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {labels.customer}: <strong>{props.customerNameSnapshot ?? props.customerId}</strong>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              {labels.schedule}
            </label>
            <input
              ref={firstFieldRef}
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          {props.initialKind === 'PROMISE' ? (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                {labels.amount}
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="12.500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={!amountValid}
                className={`mt-1 w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none dark:bg-slate-800 ${
                  amountValid
                    ? 'border-slate-300 focus:border-sky-500 dark:border-slate-700'
                    : 'border-rose-400 focus:border-rose-500'
                }`}
                data-testid="workflow-amount-input"
              />
              <p className="mt-1 text-[0.65rem] text-slate-500 dark:text-slate-400">
                {labels.amountHint}
              </p>
            </div>
          ) : null}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              {labels.priority}
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as WorkflowPriority)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              {labels.notes}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          {submitError ? (
            <div
              role="alert"
              className="rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200"
            >
              {submitError}
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={props.onClose}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              {labels.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting || !amountValid}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {labels.submit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
