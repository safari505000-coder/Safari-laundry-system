import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Navigate,
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  Clock,
  Loader2,
  Phone,
  ShieldAlert,
  StickyNote,
  Truck,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { cn } from '@/lib/utils';
import { formatKwdLabel, isMaterialKd, isPositiveKd } from '@/lib/kwd';
import {
  CustomerFinancialHeader,
  FinancialStatCard,
  TimelineCard,
  useRealtimeFinancialFeed,
} from '@/modules/finance';
import {
  SmartActionChip,
  StickyActionBar,
  type StickyActionBarItem,
  type SmartActionTone,
} from '@/modules/shared/components/operational';
import { PresenceRibbon, useOperatorPresence } from '@/modules/presence';
import {
  is360Internal,
  useCcCustomer360,
} from '../hooks/use-cc-customer-360';
import { useCcActiveDispatches } from '../hooks/use-cc-active-dispatches';
import { CustomerSearch } from '../components/customer-search';

/**
 * V22 Phase 5 — Customer360 v2 (Operational Command Center).
 *
 * Additive sibling to the existing tabbed page (`cc-customer-360-page`).
 * Mounted at `/cc/customers/:customerId/360` so any existing bookmark
 * to `/cc/customers/:customerId` keeps working untouched.
 *
 * Layout (lg+):
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ Sticky identity hero (name • phone • alerts • risk score)   │
 *   ├──────────────┬───────────────────────────────┬──────────────┤
 *   │ LEFT (240)   │ CENTER (1fr)                  │ RIGHT (320)  │
 *   │ Quick nav    │ Financial header + stat cards │ Smart chips  │
 *   │ Sub list     │ Subscription panel            │ Operator     │
 *   │ Active disp. │ Recent activity timeline      │ notes        │
 *   └──────────────┴───────────────────────────────┴──────────────┘
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ Sticky action bar (bottom): Alt+P pay, Alt+M promise, …     │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Hard rules (V21 + V22):
 *   • Every KD value rendered here comes through the canonical
 *     `useCcCustomer360` projection. No `parseFloat`, no native
 *     arithmetic, no client-side balance derivation.
 *   • `useRealtimeFinancialFeed` ONLY invalidates / triggers a
 *     canonical refetch — payload values are never displayed.
 *   • The page emits action intents via callbacks; canonical
 *     mutations live in the existing dialog components and the
 *     existing v1 `cc-customer-360-page`.
 *
 * Phase 5 is intentionally read-first: the action bar is wired to
 * navigate operators back into the v1 page (which still owns the
 * mutation dialogs) while we measure adoption. A V23 follow-up will
 * collapse the v1/v2 split once the rebuild is observed healthy.
 */

type ActionId = 'pay' | 'note' | 'dispatch' | 'callback' | 'next';

type ActionIntent = {
  id: ActionId;
  trigger: 'shortcut' | 'click';
};

export function CcCustomer360V2Page() {
  const { t } = useTranslation();
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const safeCustomerId = customerId ?? null;

  const customer360 = useCcCustomer360(safeCustomerId);
  const dispatches = useCcActiveDispatches({
    customerId: safeCustomerId,
    pollMs: 10_000,
  });

  // V22 Phase 5 — realtime adoption (canonical-purity-safe).
  useRealtimeFinancialFeed({
    channel: 'customer360',
    customerId: safeCustomerId,
    accessToken: token,
    enabled: Boolean(safeCustomerId && token),
    onEvent: () => {
      customer360.reload();
      dispatches.reload();
    },
  });

  // V23 Phase 6 — operator presence (visibility-only, no financial side-effects).
  const presence = useOperatorPresence({
    scopeKind: 'customer',
    scopeId: safeCustomerId,
    enabled: Boolean(safeCustomerId && token),
  });

  const [lastIntent, setLastIntent] = useState<ActionIntent | null>(null);
  const reloadAll = () => {
    customer360.reload();
    dispatches.reload();
  };

  const data = customer360.data;

  useEffect(() => {
    if (data) {
      const name = data.customer.displayName ?? data.customer.phone;
      document.title = `${name} · 360 v2 — Safari`;
    }
  }, [data]);

  // --- Smart hints (read-only suggestions, no autonomous actions) ---
  const smartHints = useMemo(() => {
    if (!data) return [] as Array<{
      id: string;
      label: string;
      tone: SmartActionTone;
      hint?: string;
    }>;
    const f = data.statement.financials;
    const out: Array<{
      id: string;
      label: string;
      tone: SmartActionTone;
      hint?: string;
    }> = [];
    if (f.isBlocked) {
      out.push({
        id: 'blocked',
        label: t('customer360v2.hints.blocked', { defaultValue: 'الحساب محظور' }),
        tone: 'critical',
        hint: f.blockReason ?? undefined,
      });
    }
    if (isMaterialKd(f.canonicalDebtKd)) {
      out.push({
        id: 'debt',
        label: t('customer360v2.hints.dueKd', {
          value: formatKwdLabel(f.canonicalDebtKd),
          defaultValue: `مستحق على العميل: ${formatKwdLabel(f.canonicalDebtKd)}`,
        }),
        tone: 'warn',
      });
    }
    if (
      data.subscription &&
      isPositiveKd(data.subscription.subscriptionRemainingKd)
    ) {
      out.push({
        id: 'sub-remaining',
        label: t('customer360v2.hints.subRemaining', {
          value: formatKwdLabel(data.subscription.subscriptionRemainingKd),
          defaultValue: `رصيد اشتراك: ${formatKwdLabel(data.subscription.subscriptionRemainingKd)}`,
        }),
        tone: 'recommend',
      });
    }
    if (is360Internal(data) && data.alerts && data.alerts.length > 0) {
      for (const a of data.alerts.slice(0, 3)) {
        out.push({
          id: `alert-${a.code}`,
          label: a.message,
          tone: 'info',
        });
      }
    }
    if (dispatches.rows.length > 0) {
      out.push({
        id: 'active-dispatch',
        label: t('customer360v2.hints.activeDispatch', {
          count: dispatches.rows.length,
          defaultValue: `${dispatches.rows.length} مهمة نشطة`,
        }),
        tone: 'info',
      });
    }
    return out;
  }, [data, dispatches.rows.length, t]);

  // --- Activity timeline projection (read-only) ---
  const timelineRows = useMemo(() => {
    if (!data) return [];
    const rows: Array<{
      id: string;
      kind: 'OTHER' | 'NOTE';
      title: string;
      description?: string;
      occurredAt: string;
      amountKd?: string | null;
    }> = [];
    for (const sub of data.subscriptions ?? []) {
      rows.push({
        id: `sub-${sub.id}`,
        kind: 'OTHER',
        title: t('customer360v2.timeline.subActivated', {
          plan: sub.planNameSnapshot,
          defaultValue: `تم تفعيل اشتراك: ${sub.planNameSnapshot}`,
        }),
        amountKd: sub.planSalePriceKd,
        occurredAt: sub.activatedAtIso,
      });
      if (sub.closedAtIso) {
        rows.push({
          id: `sub-close-${sub.id}`,
          kind: 'OTHER',
          title: t('customer360v2.timeline.subClosed', {
            reason: sub.closedReason ?? '—',
            defaultValue: `إغلاق اشتراك (${sub.closedReason ?? '—'})`,
          }),
          occurredAt: sub.closedAtIso,
        });
      }
    }
    for (const d of dispatches.rows) {
      rows.push({
        id: `dispatch-${d.id}`,
        kind: 'NOTE',
        title: t('customer360v2.timeline.dispatch', {
          driver: d.driverName,
          defaultValue: `إسناد: ${d.driverName}`,
        }),
        description: t('customer360v2.timeline.elapsed', {
          minutes: d.elapsedMinutes,
          defaultValue: `منذ ${d.elapsedMinutes} د`,
        }),
        occurredAt: d.createdAtIso,
      });
    }
    rows.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
    return rows.slice(0, 12);
  }, [data, dispatches.rows, t]);

  if (!user) return <Navigate to="/login" replace />;
  if (!customerId) return <Navigate to="/cc/dashboard" replace />;

  if (customer360.loading && !data) {
    return (
      <div className="space-y-4 p-4">
        <BackBar />
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('common.loading', { defaultValue: 'جاري التحميل…' })}
        </div>
      </div>
    );
  }

  if (customer360.error || !data) {
    return (
      <div className="space-y-4 p-4">
        <BackBar />
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive">
          {customer360.error ?? t('callCenterDashboard.page.notFound', {
            defaultValue: 'لم نعثر على هذا العميل.',
          })}
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => customer360.reload()}
            >
              {t('common.retry', { defaultValue: 'إعادة المحاولة' })}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const f = data.statement.financials;
  const displayName = data.customer.displayName ?? data.customer.phone;
  const score = is360Internal(data) ? data.score.value : null;
  const insight = data.insight;
  // V23.1 Final — read canonical receivable debt directly. See the
  // long-form rationale on Customer360Financials.canonicalDebtKd in
  // `web/src/lib/api.ts`.
  const unpaidInvoicesKd = f.canonicalDebtKd;
  const payableNowKd = f.canonicalDebtKd;

  // Action bar — every action just navigates to the v1 page with the
  // appropriate tab. The v1 page still owns the mutation dialogs.
  // This keeps v2 read-first while preserving every existing
  // canonical write path. A V23 follow-up will move the dialogs in.
  const actions: StickyActionBarItem[] = [
    {
      id: 'pay',
      label: t('customer360v2.actions.recordPayment', { defaultValue: 'تسجيل دفعة' }),
      shortcut: 'P',
      tone: 'success',
      icon: Banknote,
      disabled: !customerId,
      onActivate: () => {
        setLastIntent({ id: 'pay', trigger: 'shortcut' });
        navigate(`/cc/customers/${customerId}?tab=overview`);
      },
    },
    {
      id: 'note',
      label: t('customer360v2.actions.addNote', { defaultValue: 'إضافة ملاحظة' }),
      shortcut: 'N',
      tone: 'ghost',
      icon: StickyNote,
      onActivate: () => {
        setLastIntent({ id: 'note', trigger: 'click' });
        navigate(`/cc/customers/${customerId}?tab=overview`);
      },
    },
    {
      id: 'dispatch',
      label: t('customer360v2.actions.createDispatch', { defaultValue: 'إنشاء مهمة' }),
      shortcut: 'D',
      tone: 'primary',
      icon: Truck,
      disabled: f.isBlocked,
      onActivate: () => {
        setLastIntent({ id: 'dispatch', trigger: 'click' });
        navigate(`/cc/customers/${customerId}?tab=dispatch`);
      },
    },
    {
      id: 'callback',
      label: t('customer360v2.actions.callback', { defaultValue: 'جدولة معاودة الاتصال' }),
      shortcut: 'C',
      tone: 'warning',
      icon: CalendarClock,
      onActivate: () => {
        setLastIntent({ id: 'callback', trigger: 'click' });
        navigate(`/cc/customers/${customerId}?tab=overview`);
      },
    },
    {
      id: 'next',
      label: t('customer360v2.actions.next', { defaultValue: 'العميل التالي' }),
      shortcut: 'S',
      tone: 'ghost',
      icon: Phone,
      onActivate: () => {
        setLastIntent({ id: 'next', trigger: 'shortcut' });
        navigate('/cc/dashboard');
      },
    },
  ];

  return (
    <main
      className="flex min-h-screen flex-col gap-3 p-3 lg:p-4"
      aria-label="Customer 360 v2 — operational command center"
      dir="rtl"
    >
      <BackBar />

      <div className="max-w-xl">
        <CustomerSearch />
      </div>

      <PresenceRibbon coviewers={presence.coviewers} />

      <CustomerFinancialHeader
        customerName={displayName}
        customerPhone={data.customer.phone}
        remainingDebtKd={payableNowKd}
        walletBalanceKd={f.breakdown?.walletPrepaidCreditKd ?? '0.0000'}
        riskLevel={undefined}
        riskScore={score ?? undefined}
        collectionsStage={undefined}
        locale="ar"
      />

      {smartHints.length > 0 ? (
        <section
          aria-label="Smart operational suggestions"
          className="flex flex-wrap items-center gap-1.5"
        >
          {smartHints.map((h) => (
            <SmartActionChip
              key={h.id}
              label={h.label}
              hint={h.hint}
              tone={h.tone}
              icon={h.tone === 'critical' ? ShieldAlert : undefined}
            />
          ))}
        </section>
      ) : null}

      <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-[240px_minmax(0,1fr)_320px]">
        {/* LEFT — Operational nav */}
        <aside
          aria-label="Operational navigation"
          className="space-y-2 rounded-xl border border-border bg-card p-3 shadow-sm"
        >
          <h2 className="text-xs font-semibold uppercase text-muted-foreground">
            {t('customer360v2.nav.title', { defaultValue: 'الانتقال السريع' })}
          </h2>
          <ul className="space-y-1 text-sm">
            <NavItem label={t('customer360v2.nav.financial', { defaultValue: 'المالية' })} target="financial" />
            <NavItem label={t('customer360v2.nav.subscriptions', { defaultValue: 'الاشتراكات' })} target="subs" />
            <NavItem label={t('customer360v2.nav.timeline', { defaultValue: 'الخط الزمني' })} target="timeline" />
            <NavItem label={t('customer360v2.nav.notes', { defaultValue: 'الملاحظات' })} target="notes" />
          </ul>
          <div className="rounded-md border border-border bg-muted/40 p-2 text-[0.7rem] text-muted-foreground">
            {t('customer360v2.nav.shortcutsHint', {
              defaultValue: 'اضغط Alt+P للدفع · Alt+N للملاحظة · Alt+D للمهمة',
            })}
          </div>
        </aside>

        {/* CENTER — Financial workspace + timeline */}
        <section
          aria-label="Financial workspace"
          className="flex flex-col gap-3"
        >
          <div id="financial" className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <FinancialStatCard
              label={t('customer360v2.stats.unpaidInvoices', { defaultValue: 'الفواتير غير مدفوعة' })}
              value={unpaidInvoicesKd}
              unit="د.ك"
            />
            <FinancialStatCard
              label={t('customer360v2.stats.totalPayments', { defaultValue: 'إجمالي المدفوعات' })}
              value={f.totalPaymentsKd}
              unit="د.ك"
            />
            <FinancialStatCard
              label={t('customer360v2.stats.outstanding', { defaultValue: 'المستحق الحالي' })}
              value={payableNowKd}
              unit="د.ك"
              delta={isMaterialKd(payableNowKd) ? { text: t('customer360v2.stats.dueWarn', { defaultValue: 'يحتاج متابعة' }), tone: 'down' } : undefined}
            />
            <FinancialStatCard
              label={t('customer360v2.stats.subRemaining', { defaultValue: 'رصيد الاشتراك' })}
              value={f.subscriptionRemainingKd}
              unit="د.ك"
            />
          </div>

          <Card id="subs">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Wallet className="size-4" aria-hidden />
                {t('customer360v2.subs.title', { defaultValue: 'الاشتراكات' })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.subscriptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t('customer360v2.subs.empty', { defaultValue: 'لا توجد اشتراكات.' })}
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.subscriptions.slice(0, 5).map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{s.planNameSnapshot}</span>
                        <span className={cn('rounded px-1.5 py-0.5 text-[0.65rem]', s.status === 'ACTIVE' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>
                          {s.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <span>{formatKwdLabel(s.planSalePriceKd)}</span>
                        <span className="hidden sm:inline">{t('customer360v2.subs.remainingKd', { value: formatKwdLabel(s.planActualBalanceKd), defaultValue: `متبقّي: ${formatKwdLabel(s.planActualBalanceKd)}` })}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card id="timeline">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="size-4" aria-hidden />
                {t('customer360v2.timeline.title', { defaultValue: 'النشاط الأخير' })}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {timelineRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t('customer360v2.timeline.empty', { defaultValue: 'لا يوجد نشاط حديث.' })}
                </p>
              ) : (
                timelineRows.map((row) => (
                  <TimelineCard
                    key={row.id}
                    title={row.title}
                    description={row.description}
                    occurredAt={row.occurredAt}
                    kind={row.kind}
                    amountKd={row.amountKd ?? null}
                    locale="ar"
                  />
                ))
              )}
            </CardContent>
          </Card>
        </section>

        {/* RIGHT — Notes + insight */}
        <aside aria-label="Operator context" className="flex flex-col gap-3">
          <Card id="notes">
            <CardHeader>
              <CardTitle className="text-sm">
                {t('customer360v2.insight.title', { defaultValue: 'ملاحظة سريعة للموظف' })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                {insight || t('customer360v2.insight.empty', { defaultValue: 'لا توجد ملاحظة فورية.' })}
              </p>
            </CardContent>
          </Card>

          {is360Internal(data) ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  {t('customer360v2.insightDetail.title', { defaultValue: 'تحليل تفصيلي' })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                  {data.insights.detail}
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                {t('customer360v2.actionBarHint.title', { defaultValue: 'مفاتيح سريعة' })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-[0.7rem] text-muted-foreground">
                <li>Alt+P · {t('customer360v2.actions.recordPayment', { defaultValue: 'تسجيل دفعة' })}</li>
                <li>Alt+N · {t('customer360v2.actions.addNote', { defaultValue: 'إضافة ملاحظة' })}</li>
                <li>Alt+D · {t('customer360v2.actions.createDispatch', { defaultValue: 'إنشاء مهمة' })}</li>
                <li>Alt+C · {t('customer360v2.actions.callback', { defaultValue: 'جدولة معاودة الاتصال' })}</li>
                <li>Alt+S · {t('customer360v2.actions.next', { defaultValue: 'العميل التالي' })}</li>
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>

      <StickyActionBar
        actions={actions}
        ariaLabel="Customer 360 v2 quick actions"
        hint={
          lastIntent
            ? t('customer360v2.actionBar.lastIntent', {
                action: lastIntent.id,
                defaultValue: `آخر إجراء: ${lastIntent.id}`,
              })
            : null
        }
      />

      {/* Always invoke reloadAll once at first non-loading paint to
          stitch the dispatch poll with the canonical 360 fetch. */}
      <FirstPaintSync onMount={reloadAll} />
    </main>
  );
}

function NavItem({ label, target }: { label: string; target: string }) {
  return (
    <li>
      <a
        href={`#${target}`}
        className="block rounded-md px-2 py-1 text-foreground hover:bg-muted/40"
      >
        {label}
      </a>
    </li>
  );
}

function BackBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/cc/dashboard')}
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('callCenterDashboard.page.backToSearch', {
          defaultValue: 'رجوع للبحث',
        })}
      </Button>
      <span className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[0.65rem] text-muted-foreground">
        v22 · operational rebuild
      </span>
    </div>
  );
}

function FirstPaintSync({ onMount }: { onMount: () => void }) {
  useEffect(() => {
    onMount();
    // intentionally only on mount — `onMount` identity is stable per render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
