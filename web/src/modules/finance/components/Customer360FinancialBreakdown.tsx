import type { ReactNode } from 'react';
import { formatKwdLabel } from '@/lib/kwd';

/**
 * V20.8.1 — Phase 7 explicit financial breakdown surface.
 *
 * Renders the four canonical numbers from the server-side
 * `Customer360FinancialsDto.breakdown` block with EXPLICIT Arabic
 * labels and color separation:
 *
 *   • red   — receivable debt (the customer owes us)
 *   • green — subscription remaining + prepaid wallet credit
 *   • blue  — informational (paid total + operator hint)
 *
 * Hard rules (V20.7+ + V20.8.1):
 *   • NEVER reads anything but server-canonical strings.
 *   • NEVER computes a KD value (no add / sub / round here).
 *   • NEVER mixes "subscription remaining" with "debt".
 *
 * Layout is intentionally minimal so any host page (Customer 360,
 * subscriber portal, statement view) can drop it in without
 * theming friction. Per-card tone classes also satisfy the
 * V20.7 design-system color-separation guard.
 */

export type Customer360FinancialBreakdownProps = {
  /** Receivable debt (canonical = `breakdown.receivableDebtKd`). */
  receivableDebtKd: string;
  /** Subscription package remaining (canonical = `breakdown.subscriptionRemainingKd`). */
  subscriptionRemainingKd: string;
  /** Non-subscription prepaid credit (canonical = `breakdown.walletPrepaidCreditKd`). */
  walletPrepaidCreditKd: string;
  /** Historical paid total (canonical = `breakdown.paidTotalKd`). */
  paidTotalKd: string;
  /** Server-built explanatory hint (canonical = `breakdown.operatorHint`). */
  operatorHint?: string;
  /** Optional override for the card title. */
  title?: ReactNode;
};

type Tone = 'debt' | 'subscription' | 'wallet' | 'paid';

const TONE_CLASSES: Record<Tone, { wrap: string; label: string; value: string }> = {
  // Red — debt
  debt: {
    wrap: 'border-rose-300 bg-rose-50/80 dark:border-rose-900/60 dark:bg-rose-950/40',
    label: 'text-rose-700 dark:text-rose-200',
    value: 'text-rose-900 dark:text-rose-50',
  },
  // Green — prepaid usable balance (subscription package)
  subscription: {
    wrap: 'border-emerald-300 bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/40',
    label: 'text-emerald-700 dark:text-emerald-200',
    value: 'text-emerald-900 dark:text-emerald-50',
  },
  // Green — non-subscription prepaid wallet credit (same family, lighter shade)
  wallet: {
    wrap: 'border-teal-300 bg-teal-50/80 dark:border-teal-900/60 dark:bg-teal-950/40',
    label: 'text-teal-700 dark:text-teal-200',
    value: 'text-teal-900 dark:text-teal-50',
  },
  // Blue — informational (paid total)
  paid: {
    wrap: 'border-sky-300 bg-sky-50/80 dark:border-sky-900/60 dark:bg-sky-950/40',
    label: 'text-sky-700 dark:text-sky-200',
    value: 'text-sky-900 dark:text-sky-50',
  },
};

function Tile(props: {
  tone: Tone;
  label: string;
  tooltip: string;
  amountKd: string;
}) {
  const tone = TONE_CLASSES[props.tone];
  return (
    <div
      className={`rounded-xl border p-3 shadow-sm ${tone.wrap}`}
      title={props.tooltip}
      data-v20-8-1-tile={props.tone}
    >
      <div className={`text-[11px] font-medium ${tone.label}`}>{props.label}</div>
      <div
        className={`mt-1 text-lg font-semibold tabular-nums ${tone.value}`}
        data-v20-8-1-amount={props.tone}
      >
        {formatKwdLabel(props.amountKd)}
      </div>
    </div>
  );
}

export function Customer360FinancialBreakdown(
  props: Customer360FinancialBreakdownProps,
) {
  return (
    <section
      className="space-y-2"
      aria-label="ملخص الحالة المالية للعميل"
      data-v20-8-1-breakdown
    >
      {props.title ? (
        <h3 className="text-sm font-semibold text-foreground">{props.title}</h3>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile
          tone="debt"
          label="المبلغ المستحق على العميل"
          tooltip="ما يدين به العميل لنا — مصدر canonical: receivableDebtKd"
          amountKd={props.receivableDebtKd}
        />
        <Tile
          tone="subscription"
          label="المتبقي من الباقة"
          tooltip="رصيد الاشتراك القابل للاستخدام — مصدر canonical: subscriptionRemainingKd"
          amountKd={props.subscriptionRemainingKd}
        />
        <Tile
          tone="wallet"
          label="الرصيد المدفوع مسبقاً"
          tooltip="رصيد مخزن غير مرتبط بباقة — مصدر canonical: walletPrepaidCreditKd"
          amountKd={props.walletPrepaidCreditKd}
        />
        <Tile
          tone="paid"
          label="إجمالي المدفوع"
          tooltip="مجموع المدفوعات التاريخية — مصدر canonical: paidTotalKd"
          amountKd={props.paidTotalKd}
        />
      </div>
      {props.operatorHint ? (
        <p
          className="text-xs leading-relaxed text-sky-700 dark:text-sky-200"
          data-v20-8-1-operator-hint
        >
          {props.operatorHint}
        </p>
      ) : null}
    </section>
  );
}

export default Customer360FinancialBreakdown;
