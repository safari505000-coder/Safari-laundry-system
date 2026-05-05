import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  apiJson,
  type CustomerLedgerEvent,
  type CustomerLedgerInvoice,
  type CustomerLedgerResponse,
} from '@/lib/api';
import { parseLedgerOperationalDebtKd } from '@/lib/customer-ledger-parse';
import { formatKwdLabel } from '@/lib/kwd';
import { OperatorRouteHint } from '@/modules/shared/components/shell/operator-route-hint';
import { PrintableSheet } from '@/modules/shared/print/PrintableSheet';
import './statement-print.css';

/**
 * V19.8.4 — Printable customer statement (كشف حساب العميل).
 *
 * Rendered for the customer-facing "here is where every dinar went"
 * conversation that happens at Call Center. The same A4 brand sheet
 * the HR forms use (Safari letterhead, verification QR stamp, RTL
 * typography) so a printed copy looks official next to a payslip or a
 * leave form.
 *
 * V19.8.9 — The render body is extracted into `StatementSheet` below
 * so both the authenticated Call-Center flow and the public shared
 * link (`/public/statement/:token`) can render byte-identical output
 * without duplicating the JSX.
 */

const KD_FMT_4 = (v: string | number | null | undefined) => {
  const n = typeof v === 'string' ? Number.parseFloat(v) : (v ?? 0);
  return formatKwdLabel(Number.isFinite(n) ? n : 0);
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })} — ${d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const ORDER_STATUS_AR: Record<string, string> = {
  PENDING: 'قيد الانتظار',
  PICKED_UP: 'تم الاستلام',
  IN_PROGRESS: 'قيد التنفيذ',
  OUT_FOR_DELIVERY: 'في التوصيل',
  COMPLETED: 'مكتمل',
  CANCELED: 'ملغى',
};

const CASH_STATUS_AR: Record<string, string> = {
  UNPAID: 'غير مدفوع',
  PAID_TO_DRIVER: 'مسدّد',
  HANDED_OVER_TO_OFFICE: 'مسدّد ومورّد',
};

const METHOD_AR: Record<string, string> = {
  CASH: 'نقداً',
  KNET: 'كي نت',
  PAYMENT_LINK: 'رابط دفع',
  ONLINE: 'أونلاين',
  SUBSCRIPTION_WALLET: 'من الرصيد',
  DEBT_ON_ACCOUNT: 'على الحساب (ذمة)',
};

const EVENT_KIND_AR: Record<string, string> = {
  SUBSCRIPTION_ACTIVATION: 'تجديد أو تفعيل اشتراك',
  SUBSCRIPTION_ROLLOVER_CARRY: 'ترحيل رصيد اشتراك',
  ORDER_PAID_IN_FULL: 'فاتورة مدفوعة',
  ORDER_SETTLEMENT_SUBSCRIPTION: 'تسوية فاتورة (من رصيد الاشتراك)',
  ORDER_INVOICE_PARTIAL_PAYMENT: 'تسديد جزئي للفاتورة',
  ORDER_INVOICE_ON_ACCOUNT: 'تسجيل فاتورة على الحساب (ذمة)',
  PARTIAL_DEBT_PAYMENT: 'تسديد جزئي من المديونية',
};

/**
 * One invoice sub-table (shared thead). Used for unpaid / paid / canceled
 * groups on the printed statement.
 */
function StatementInvoiceSubTable({
  invoices,
  title,
  hint,
  trClass,
  foot,
}: {
  invoices: CustomerLedgerInvoice[];
  title: string;
  hint?: string;
  trClass?: (inv: CustomerLedgerInvoice) => string | undefined;
  foot?: ReactNode;
}) {
  if (invoices.length === 0) return null;
  return (
    <div className="stmt-invoice-block">
      <h4 className="stmt-invoice-group-title">{title}</h4>
      {hint ? <p className="stmt-invoice-group-hint">{hint}</p> : null}
      <table className="printable-sheet__table">
        <thead>
          <tr>
            <th style={{ width: '18%' }}>رقم الفاتورة</th>
            <th style={{ width: '22%' }}>التاريخ</th>
            <th style={{ width: '20%' }}>حالة الطلب</th>
            <th style={{ width: '20%' }}>حالة الدفع</th>
            <th style={{ width: '20%', textAlign: 'end' }}>المبلغ</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr
              key={inv.id}
              className={trClass ? trClass(inv) : undefined}
            >
              <td>#{inv.serial ?? inv.id.slice(0, 8)}</td>
              <td>{formatDate(inv.completedAtIso ?? inv.createdAtIso)}</td>
              <td>{ORDER_STATUS_AR[inv.status] ?? inv.status}</td>
              <td>
                {CASH_STATUS_AR[inv.cashStatus] ?? inv.cashStatus}
                {inv.paymentMethod ? (
                  <span className="stmt-pay-method">
                    ({METHOD_AR[inv.paymentMethod] ?? inv.paymentMethod})
                  </span>
                ) : null}
              </td>
              <td style={{ textAlign: 'end' }}>
                <strong>{KD_FMT_4(inv.totalKd)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
        {foot}
      </table>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Shared A4 body — used by both the authenticated CC flow and the
// public share link. Caller supplies the already-fetched
// `CustomerLedgerResponse`, the window label, and a back-button
// handler; everything else is presentational.
// ────────────────────────────────────────────────────────────────────

export function StatementSheet({
  data,
  rangeLabel,
  onBack,
}: {
  data: CustomerLedgerResponse;
  rangeLabel: string;
  onBack?: () => void;
}) {
  const totals = useMemo(() => {
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalOpenDebt = 0;
    for (const inv of data.invoices) {
      if (inv.status === 'CANCELED') continue;
      const v = Number.parseFloat(inv.totalKd) || 0;
      totalInvoiced += v;
      if (inv.openDebt) totalOpenDebt += v;
      else totalPaid += v;
    }
    return { totalInvoiced, totalPaid, totalOpenDebt };
  }, [data]);

  const invBuckets = useMemo(() => {
    const unpaid: CustomerLedgerInvoice[] = [];
    const paid: CustomerLedgerInvoice[] = [];
    const canceled: CustomerLedgerInvoice[] = [];
    for (const inv of data.invoices) {
      if (inv.status === 'CANCELED') {
        canceled.push(inv);
        continue;
      }
      if (inv.openDebt) unpaid.push(inv);
      else paid.push(inv);
    }
    return { unpaid, paid, canceled };
  }, [data]);

  /**
   * Full Σ uncollection matches `/collections` (server field). Fallback:
   * sum `openDebt` rows on **this page** only when legacy responses omit it.
   */
  const collectionsReceivableFromApi = data.customer.collectionsReceivableKd;
  const openInvoicesKdForTile =
    collectionsReceivableFromApi !== undefined &&
    collectionsReceivableFromApi.trim() !== ''
      ? Number.parseFloat(collectionsReceivableFromApi) || 0
      : totals.totalOpenDebt;

  const issuedAtIso = new Date().toISOString();
  const customerName = data.customer.displayName ?? '—';
  const customerPhone = data.customer.phone ?? '—';
  const branchName = data.customer.originBranchName ?? '—';
  const sub = data.activeSubscription;
  const debtK = parseLedgerOperationalDebtKd(data.customer);
  const balK = Number.parseFloat(data.customer.walletBalanceKd) || 0;
  const docNumber = `STMT-${data.customer.id.slice(0, 8).toUpperCase()}`;

  const subtitle = `${customerName} — ${customerPhone} • ${rangeLabel}`;

  const status: {
    label: string;
    kind: 'approved' | 'rejected' | 'pending' | 'paid';
  } = debtK > 0
    ? { label: `مديونية: ${formatKwdLabel(debtK)}`, kind: 'rejected' }
    : balK > 0
      ? { label: `رصيد: ${formatKwdLabel(balK)}`, kind: 'paid' }
      : { label: 'حساب متوازن', kind: 'approved' };

  return (
    <div className="stmt-print-wrap">
      <PrintableSheet
        docType="STATEMENT"
        docId={data.customer.id}
        docNumber={docNumber}
        issuedAtIso={issuedAtIso}
        title="كشف حساب العميل"
        subtitle={subtitle}
        status={status}
        onBack={onBack}
      >
        {/* ─── 1. Customer identity card ─────────────────────────── */}
        <section className="printable-sheet__section">
          <h3 className="printable-sheet__section-title">بيانات العميل</h3>
          <div className="printable-sheet__grid-3">
            <div className="printable-sheet__field">
              <span className="printable-sheet__label">الاسم</span>
              <span className="printable-sheet__value">{customerName}</span>
            </div>
            <div className="printable-sheet__field">
              <span className="printable-sheet__label">رقم الهاتف</span>
              <span className="printable-sheet__value">{customerPhone}</span>
            </div>
            <div className="printable-sheet__field">
              <span className="printable-sheet__label">الفرع الأصلي</span>
              <span className="printable-sheet__value">{branchName}</span>
            </div>
          </div>
        </section>

        {/* ─── 2. Financial snapshot ─────────────────────────────── */}
        <section className="printable-sheet__section">
          <h3 className="printable-sheet__section-title">الملخص المالي</h3>
          <div className="stmt-snapshot-grid">
            <div className="stmt-snapshot-tile stmt-tone-balance">
              <span className="stmt-snapshot-label">الرصيد الحالي</span>
              <span className="stmt-snapshot-value">{formatKwdLabel(balK)}</span>
            </div>
            <div
              className={`stmt-snapshot-tile ${debtK > 0 ? 'stmt-tone-debt' : 'stmt-tone-clear'}`}
            >
              <span className="stmt-snapshot-label">المديونية الحالية</span>
              <span className="stmt-snapshot-value">{formatKwdLabel(debtK)}</span>
            </div>
            <div className="stmt-snapshot-tile stmt-tone-info">
              <span className="stmt-snapshot-label">الفواتير المفتوحة</span>
              <span className="stmt-snapshot-value">
                {formatKwdLabel(openInvoicesKdForTile)}
              </span>
              <span className="stmt-snapshot-sub">
                من إجمالي {formatKwdLabel(totals.totalInvoiced)}
              </span>
            </div>
          </div>

          {sub ? (
            <div className="stmt-sub-card">
              <div className="stmt-sub-card-head">
                <span className="stmt-sub-badge">الاشتراك الحالي</span>
                <span className="stmt-sub-title">{sub.planNameSnapshot}</span>
              </div>
              <div className="stmt-sub-grid">
                <div>
                  <span className="printable-sheet__label">تاريخ التفعيل</span>
                  <span className="printable-sheet__value">
                    {formatDate(sub.activatedAtIso)}
                  </span>
                </div>
                <div>
                  <span className="printable-sheet__label">تاريخ الانتهاء</span>
                  <span className="printable-sheet__value">
                    {formatDate(sub.expiresAtIso)}
                  </span>
                </div>
                <div>
                  <span className="printable-sheet__label">قيمة الرصيد</span>
                  <span className="printable-sheet__value">
                    {KD_FMT_4(sub.planActualBalanceKd)}
                  </span>
                </div>
                <div>
                  <span className="printable-sheet__label">مدة الاشتراك</span>
                  <span className="printable-sheet__value">
                    {sub.planValidityDays} يوماً
                  </span>
                </div>
              </div>
              {Number.parseFloat(sub.carriedBalanceKd) !== 0 ? (
                <div className="stmt-sub-carried">
                  <span className="stmt-sub-carried-label">
                    رصيد مرحّل (من اشتراك/تسوية سابقة)
                  </span>
                  <span className="stmt-sub-carried-value">
                    {KD_FMT_4(sub.carriedBalanceKd)}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* ─── 3. Invoices: unpaid → paid → canceled (read as "what I owe" first) */}
        <section className="printable-sheet__section">
          <h3 className="printable-sheet__section-title">
            الفواتير ({data.invoices.length})
          </h3>
          {data.invoices.length === 0 ? (
            <p className="stmt-empty">لا توجد فواتير مسجّلة.</p>
          ) : (
            <>
              <StatementInvoiceSubTable
                title="فواتير غير مدفوعة"
                hint="مبالغ لا تزال مطلوبة، أو بانتظار توريد المندوب."
                invoices={invBuckets.unpaid}
                trClass={(inv) =>
                  inv.openDebt ? 'stmt-invoice-open' : undefined
                }
                foot={
                  invBuckets.unpaid.length > 0 ? (
                    <tfoot>
                      <tr>
                        <td colSpan={4}>إجمالي غير المسدّد (هذا القسم)</td>
                        <td style={{ textAlign: 'end', color: '#b91c1c' }}>
                          {formatKwdLabel(
                            invBuckets.unpaid.reduce(
                              (s, i) => s + (Number.parseFloat(i.totalKd) || 0),
                              0,
                            ),
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  ) : null
                }
              />
              <StatementInvoiceSubTable
                title="فواتير مدفوعة"
                hint="طلبات اكتملت وتم سدادها (نقداً، كي نت، أونلاين، أو من رصيد الاشتراك)."
                invoices={invBuckets.paid}
              />
              <StatementInvoiceSubTable
                title="فواتير ملغاة"
                hint="لا تُحسب ضمن المدفوع أو المستحق."
                invoices={invBuckets.canceled}
                trClass={() => 'stmt-invoice-canceled'}
              />
            </>
          )}
        </section>

        {/* ─── 4. Financial transactions (الحركة) — after invoices so renewals + settlements are contextual */}
        <section className="printable-sheet__section">
          <h3 className="printable-sheet__section-title">
            الحركة المالية ({data.events.length})
          </h3>
          <p className="stmt-events-intro">
            يوضح هذا الجدول أين ذهب المال:{' '}
            <strong>تجديد/تفعيل اشتراك</strong> (مع تفصيل دفع المديونية
            وإقفال فواتير سابقة عند الصف الموسّع)، و
            <strong> فواتير مدفوعة</strong> (نقداً أو إلكترونياً)، و
            <strong> تسوية من رصيد الاشتراك</strong>، و
            <strong> تسديد جزئي</strong>، و<strong>تسجيل آجل</strong>، و
            <strong>ترحيل رصيد</strong>.
          </p>
          {data.events.length === 0 ? (
            <p className="stmt-empty">لا توجد حركة مالية مسجّلة.</p>
          ) : (
            <table className="printable-sheet__table stmt-events-table">
              <thead>
                <tr>
                  <th style={{ width: '24%' }}>التاريخ</th>
                  <th style={{ width: '24%' }}>نوع الحركة</th>
                  <th style={{ width: '14%' }}>المبلغ</th>
                  <th style={{ width: '14%' }}>الرصيد بعد</th>
                  <th style={{ width: '14%' }}>المديونية بعد</th>
                  <th style={{ width: '10%' }}>المرجع</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((e) => (
                  <EventRows key={e.id} event={e} />
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ─── 5. Certification line (looks good next to the QR) ── */}
        <section className="stmt-cert-note">
          <p>
            نُفيدكم بأن هذا الكشف يمثّل الحركات المالية المسجّلة في نظامنا حتى
            لحظة الطباعة أعلاه. لأي استفسار، يُرجى التواصل مع مركز خدمة
            العملاء على <strong>22200299</strong>. يُمكن التحقق من صحّة هذا
            المستند بمسح الرمز المرفق أدناه.
          </p>
        </section>
      </PrintableSheet>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Authenticated Call-Center flow (token + auto-print).
// ────────────────────────────────────────────────────────────────────

export function StatementPrintPage() {
  const { customerId = '' } = useParams<{ customerId: string }>();
  const [search] = useSearchParams();
  const { token } = useAuth();
  const [data, setData] = useState<CustomerLedgerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoPrintedRef = useRef(false);

  const from = search.get('from')?.trim() || '';
  const to = search.get('to')?.trim() || '';

  useEffect(() => {
    if (!token || !customerId) return;
    const params = new URLSearchParams({ limit: '500' });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    apiJson<CustomerLedgerResponse>(
      `/api/call-center/customers/${customerId}/ledger?${params.toString()}`,
      { token },
    )
      .then(setData)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : 'تعذّر تحميل الكشف'),
      );
  }, [token, customerId, from, to]);

  useEffect(() => {
    if (!data || autoPrintedRef.current) return;
    autoPrintedRef.current = true;
    const id = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        /* Browser blocked auto-print; the toolbar button still works. */
      }
    }, 600);
    return () => window.clearTimeout(id);
  }, [data]);

  if (error) {
    return (
      <div className="statement-print-error" dir="rtl">
        <p>{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="statement-print-loading" dir="rtl">
        جارٍ تحميل الكشف…
      </div>
    );
  }

  const rangeLabel =
    from && to
      ? `من ${from} إلى ${to}`
      : from
        ? `من ${from}`
        : to
          ? `حتى ${to}`
          : 'كامل السجل';

  // V19.8.6 — opened via window.open so browser history may be empty;
  // navigate(-1) is a no-op. Close the tab when there is nothing to
  // go back to.
  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.close();
    }
  };

  return (
    <>
      <div className="mx-auto max-w-6xl print:hidden">
        <OperatorRouteHint />
      </div>
      <StatementSheet data={data} rangeLabel={rangeLabel} onBack={handleBack} />
    </>
  );
}

/**
 * Renders one ledger event as a main `<tr>` + an optional expanded
 * `<tr>` that shows the activation breakdown (money flow + auto-closed
 * invoices). Split into a component so the big `map(...)` stays clean.
 */
function EventRows({ event: e }: { event: CustomerLedgerEvent }) {
  const label = EVENT_KIND_AR[e.kind] ?? e.kind;
  const planTag = e.subscriptionLabel ? ` — ${e.subscriptionLabel}` : '';
  const ref = e.orderSerial ? `#${e.orderSerial}` : '—';
  const balanceAfter = Number.parseFloat(e.balanceAfterKd) || 0;
  const debtAfter =
    (Number.parseFloat(e.debtAfterKd) || 0) + Math.max(-balanceAfter, 0);
  const showBreakdown =
    e.kind === 'SUBSCRIPTION_ACTIVATION' && e.activationBreakdown;

  return (
    <>
      <tr className={showBreakdown ? 'stmt-event-head' : undefined}>
        <td className="stmt-event-date">{formatDateTime(e.atIso)}</td>
        <td>
          <span className="stmt-event-kind">{label}</span>
          <span className="stmt-event-plan">{planTag}</span>
        </td>
        <td className="stmt-num">{KD_FMT_4(e.amountKd)}</td>
        <td className="stmt-num">{KD_FMT_4(e.balanceAfterKd)}</td>
        <td
          className="stmt-num"
          style={debtAfter > 0 ? { color: '#b91c1c' } : undefined}
        >
          {KD_FMT_4(debtAfter)}
        </td>
        <td>{ref}</td>
      </tr>
      {showBreakdown && e.activationBreakdown ? (
        <tr className="stmt-event-detail">
          <td colSpan={6}>
            <div className="stmt-breakdown">
              <div className="stmt-breakdown-title">
                تفصيل الحركة المالية للاشتراك
              </div>
              <dl className="stmt-breakdown-grid">
                <BreakdownItem
                  label="مدفوع من العميل"
                  value={KD_FMT_4(e.activationBreakdown.totalCollectedKd)}
                />
                <BreakdownItem
                  label="قيمة الرصيد المضاف للاشتراك"
                  value={KD_FMT_4(e.activationBreakdown.actualBalanceKd)}
                  tone="info"
                />
                {Number.parseFloat(e.activationBreakdown.subsidyKd) > 0 ? (
                  <BreakdownItem
                    label="دعم الفرع"
                    value={KD_FMT_4(e.activationBreakdown.subsidyKd)}
                  />
                ) : null}
                {Number.parseFloat(e.activationBreakdown.debtSettledKd) >
                0 ? (
                  <BreakdownItem
                    label="خُصم من المديونية السابقة"
                    value={KD_FMT_4(e.activationBreakdown.debtSettledKd)}
                    tone="success"
                  />
                ) : null}
                {Number.parseFloat(e.activationBreakdown.creditedToBalanceKd) >
                0 ? (
                  <BreakdownItem
                    label="أُضيف لرصيد المحفظة"
                    value={KD_FMT_4(e.activationBreakdown.creditedToBalanceKd)}
                  />
                ) : null}
                {Number.parseFloat(e.activationBreakdown.carriedBalanceKd) !==
                0 ? (
                  <BreakdownItem
                    label={
                      Number.parseFloat(
                        e.activationBreakdown.carriedBalanceKd,
                      ) < 0
                        ? 'دين مرحّل قبل التفعيل'
                        : 'رصيد مرحّل قبل التفعيل'
                    }
                    value={KD_FMT_4(e.activationBreakdown.carriedBalanceKd)}
                  />
                ) : null}
                <BreakdownItem
                  label="الرصيد بعد التفعيل"
                  value={KD_FMT_4(e.balanceAfterKd)}
                  tone={balanceAfter < 0 ? 'danger' : 'success'}
                />
                <BreakdownItem
                  label="المديونية بعد التفعيل"
                  value={KD_FMT_4(debtAfter)}
                  tone={debtAfter > 0 ? 'danger' : undefined}
                />
              </dl>
              {e.closedInvoices.length > 0 ? (
                <div className="stmt-closed-block">
                  <div className="stmt-closed-title">
                    فواتير سابقة تم سدادها تلقائياً (
                    {e.closedInvoices.length})
                  </div>
                  <table className="stmt-closed-table">
                    <thead>
                      <tr>
                        <th>الفاتورة</th>
                        <th>التاريخ</th>
                        <th style={{ textAlign: 'end' }}>المبلغ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.closedInvoices.map((inv) => (
                        <tr key={inv.id}>
                          <td>#{inv.serial ?? inv.id.slice(0, 8)}</td>
                          <td>{formatDate(inv.createdAtIso)}</td>
                          <td style={{ textAlign: 'end' }}>
                            {KD_FMT_4(inv.totalKd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2}>
                          <strong>إجمالي الفواتير المسدّدة</strong>
                        </td>
                        <td style={{ textAlign: 'end' }}>
                          <strong>
                            {formatKwdLabel(
                              e.closedInvoices.reduce(
                                (s, x) =>
                                  s + (Number.parseFloat(x.totalKd) || 0),
                                0,
                              ),
                            )}
                          </strong>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : Number.parseFloat(e.activationBreakdown.debtSettledKd) > 0 ? (
                <p className="stmt-closed-note">
                  المبلغ خُصم من إجمالي المديونية في المحفظة — لم تُقفل
                  فواتير بعينها بشكل كامل.
                </p>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function BreakdownItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'info' | 'success' | 'danger';
}) {
  const cls =
    tone === 'success'
      ? 'stmt-bd-row stmt-bd-success'
      : tone === 'danger'
        ? 'stmt-bd-row stmt-bd-danger'
      : tone === 'info'
        ? 'stmt-bd-row stmt-bd-info'
        : 'stmt-bd-row';
  return (
    <div className={cls}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default StatementPrintPage;
