import type { ReactElement } from 'react';
import {
  recommendActions,
  paymentProbabilityTier,
  type SmartActionId,
  type SmartActionInput,
} from '../workflow/smart-action-engine';

/**
 * V20.9 — Phase 3 Collections Assistant Panel.
 *
 * Renders the next-best action recommendations + a quick-glance
 * "what does this customer look like right now?" summary.
 *
 * # Server-canonical-only
 *
 * Every value rendered is either:
 *   • A pre-formatted server-canonical string (e.g. last contact
 *     date), OR
 *   • A boolean / categorical signal that the engine consumes.
 *
 * The panel does ZERO arithmetic on KD fields. It does NOT compute
 * percentages — `paymentProbabilityTier()` returns a categorical
 * bucket (`high | medium | low`).
 */

export type CollectionsAssistantPanelProps = {
  customerName: string;
  /** Pre-formatted server-canonical strings. */
  signals: SmartActionInput & {
    lastContactDisplay?: string | null;
    activePromiseDateDisplay?: string | null;
    daysOverdueDisplay?: string | null;
  };
  /** Locale for the labels. The component falls back to AR keys. */
  locale?: 'ar' | 'en';
  /** Operator-supplied callback. The panel never mutates anything itself. */
  onActionPick?: (action: SmartActionId) => void;
};

const LABELS_AR: Record<string, string> = {
  'collections.action.fraud.investigate': 'فتح تحقيق احتيال',
  'collections.action.fraud.reason': 'تنبيه احتيال بدرجة عالية أو حرجة',
  'collections.action.escalate': 'تصعيد فوري',
  'collections.action.escalate.reason.sla': 'خرق SLA على عميل عالي/حرج المخاطر',
  'collections.action.promise.brokenLog': 'تسجيل وعد مكسور',
  'collections.action.promise.brokenLog.reason': 'العميل لم يلتزم بوعد سابق',
  'collections.action.block': 'مراجعة حظر العميل',
  'collections.action.block.reason': 'مخاطر حرجة + تأخر مزمن (≥ 60 يوم)',
  'collections.action.promise.set': 'وعد بالسداد',
  'collections.action.promise.set.reason': 'فاتورة متأخرة بدون وعد فعّال',
  'collections.action.call': 'مكالمة متابعة',
  'collections.action.call.reason': 'لا يوجد تواصل خلال آخر 7 أيام',
  'collections.action.reminder': 'تذكير سداد',
  'collections.action.reminder.reason': 'مؤشر SLA على وشك الخرق',
  'collections.action.fieldVisit': 'طلب زيارة ميدانية',
  'collections.action.fieldVisit.reason': 'مخاطر حرجة بدون خرق SLA حتى الآن',
  'collections.action.none': 'لا حاجة لإجراء',
  'collections.action.none.reason': 'الحالة طبيعية',
  'collections.assistant.title': 'مساعد التحصيل',
  'collections.assistant.signal.daysOverdue': 'أيام التأخر',
  'collections.assistant.signal.lastContact': 'آخر تواصل',
  'collections.assistant.signal.lastPromise': 'آخر وعد',
  'collections.assistant.signal.payTier': 'احتمال التحصيل',
  'collections.assistant.tier.high': 'مرتفع',
  'collections.assistant.tier.medium': 'متوسط',
  'collections.assistant.tier.low': 'منخفض',
};

const LABELS_EN: Record<string, string> = {
  'collections.action.fraud.investigate': 'Open fraud investigation',
  'collections.action.fraud.reason': 'High/critical fraud alert active',
  'collections.action.escalate': 'Escalate immediately',
  'collections.action.escalate.reason.sla': 'SLA breach on high/critical-risk customer',
  'collections.action.promise.brokenLog': 'Log broken promise',
  'collections.action.promise.brokenLog.reason': 'Customer broke a previous promise',
  'collections.action.block': 'Review block on customer',
  'collections.action.block.reason': 'Critical risk + chronic overdue (≥ 60d)',
  'collections.action.promise.set': 'Set promise to pay',
  'collections.action.promise.set.reason': 'Overdue invoice without an active promise',
  'collections.action.call': 'Schedule follow-up call',
  'collections.action.call.reason': 'No contact in the last 7+ days',
  'collections.action.reminder': 'Send payment reminder',
  'collections.action.reminder.reason': 'SLA at risk',
  'collections.action.fieldVisit': 'Request field visit',
  'collections.action.fieldVisit.reason': 'Critical risk, no SLA breach yet',
  'collections.action.none': 'No action needed',
  'collections.action.none.reason': 'Healthy account',
  'collections.assistant.title': 'Collections Assistant',
  'collections.assistant.signal.daysOverdue': 'Days overdue',
  'collections.assistant.signal.lastContact': 'Last contact',
  'collections.assistant.signal.lastPromise': 'Last promise',
  'collections.assistant.signal.payTier': 'Payment probability',
  'collections.assistant.tier.high': 'High',
  'collections.assistant.tier.medium': 'Medium',
  'collections.assistant.tier.low': 'Low',
};

export function CollectionsAssistantPanel(
  props: CollectionsAssistantPanelProps,
): ReactElement {
  const locale = props.locale ?? 'ar';
  const t = (key: string): string =>
    (locale === 'ar' ? LABELS_AR : LABELS_EN)[key] ?? key;

  const actions = recommendActions(props.signals);
  const tier = paymentProbabilityTier(props.signals);

  return (
    <section
      role="region"
      aria-label={t('collections.assistant.title')}
      className="flex flex-col gap-3 rounded-lg border bg-background p-4 text-sm"
    >
      <header className="flex items-baseline justify-between">
        <h3 className="text-base font-semibold">
          {t('collections.assistant.title')}
        </h3>
        <span className="font-medium text-muted-foreground">
          {props.customerName}
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <Signal
          label={t('collections.assistant.signal.daysOverdue')}
          value={props.signals.daysOverdueDisplay ?? '—'}
        />
        <Signal
          label={t('collections.assistant.signal.lastContact')}
          value={props.signals.lastContactDisplay ?? '—'}
        />
        <Signal
          label={t('collections.assistant.signal.lastPromise')}
          value={props.signals.activePromiseDateDisplay ?? '—'}
        />
        <Signal
          label={t('collections.assistant.signal.payTier')}
          value={t(`collections.assistant.tier.${tier}`)}
        />
      </dl>

      <ol className="flex flex-col gap-2">
        {actions.map((a, idx) => (
          <li
            key={a.id}
            className={`flex items-start gap-2 rounded-md border px-3 py-2 ${
              a.critical
                ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/40'
                : ''
            }`}
          >
            <span
              aria-hidden
              className={`mt-0.5 inline-block size-2 rounded-full ${
                a.critical ? 'bg-red-500' : 'bg-emerald-500'
              }`}
            />
            <div className="flex flex-1 flex-col">
              <button
                type="button"
                className="text-start text-sm font-medium hover:underline"
                onClick={() => props.onActionPick?.(a.id)}
                data-action-id={a.id}
                data-priority={a.priority}
                data-critical={a.critical ? 'true' : 'false'}
              >
                {idx === 0 ? '➜ ' : ''}
                {t(a.labelKey)}
              </button>
              <span className="text-xs text-muted-foreground">
                {t(a.reasonKey)}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Signal({
  label,
  value,
}: {
  label: string;
  value: string;
}): ReactElement {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
