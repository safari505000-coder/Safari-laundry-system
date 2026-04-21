import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  apiJson,
  type CustomerLedgerResponse,
  type CustomerLedgerEvent,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
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
 * Sections, in order:
 *   1. Customer header (name, phone, branch of origin).
 *   2. Financial snapshot (wallet balance + active plan + debt tile).
 *   3. Transaction ledger — every TH event in the window, with an
 *      inline "money flow" card on each SUBSCRIPTION_ACTIVATION row
 *      and the list of invoices the activation auto-closed (V19.8.3).
 *   4. Invoice listing — every order on the account with cash status.
 *
 * Auth: reuses the existing `/api/call-center/customers/:id/ledger`
 * endpoint (backend RBAC already restricts visibility to OWNER / GM /
 * MANAGER / CALL_CENTER / ACCOUNTANT / SUPERVISOR / VIEWER). The page
 * is not public — the QR at the bottom resolves through
 * `/api/verify/statement/:id` which only returns what the sheet
 * already prints (never the timeline).
 */

const KD_FMT_4 = (v: string | number | null | undefined) => {
  const n = typeof v === 'string' ? Number.parseFloat(v) : (v ?? 0);
  return formatKwdLabel(Number.isFinite(n) ? n : 0);
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('ar-KW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })} — ${d.toLocaleTimeString('ar-KW', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-KW', {
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
};

const EVENT_KIND_AR: Record<string, string> = {
  SUBSCRIPTION_ACTIVATION: 'تفعيل / تجديد اشتراك',
  SUBSCRIPTION_ROLLOVER_CARRY: 'ترحيل اشتراك',
  ORDER_SETTLEMENT: 'تسوية فاتورة',
  PARTIAL_DEBT_PAYMENT: 'تسديد جزء من المديونية',
};

export function StatementPrintPage() {
  const { customerId = '' } = useParams<{ customerId: string }>();
  const [search] = useSearchParams();
  const { token } = useAuth();
  const [data, setData] = useState<CustomerLedgerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoPrintedRef = useRef(false);

  // V19.8.5 — optional Kuwait-local date range. When present, forwards
  // to the ledger endpoint (which already honors `from` / `to`) and
  // the printed subtitle tells the customer which window they're
  // looking at.
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

  // Auto-trigger the browser print dialog once the statement renders so
  // the Call Center flow ("print this for the customer") stays single-
  // click. The `autoPrintedRef` guard prevents React Strict-Mode's
  // double-invocation in dev from firing `window.print()` twice.
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

  const totals = useMemo(() => {
    if (!data) return null;
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

  if (error) {
    return (
      <div className="statement-print-error" dir="rtl">
        <p>{error}</p>
      </div>
    );
  }
  if (!data || !totals) {
    return (
      <div className="statement-print-loading" dir="rtl">
        جارٍ تحميل الكشف…
      </div>
    );
  }

  const issuedAtIso = new Date().toISOString();
  const customerName = data.customer.displayName ?? '—';
  const customerPhone = data.customer.phone ?? '—';
  const branchName = data.customer.originBranchName ?? '—';
  const sub = data.activeSubscription;
  const debtK = Number.parseFloat(data.customer.walletDebtKd) || 0;
  const balK = Number.parseFloat(data.customer.walletBalanceKd) || 0;
  const docNumber = `STMT-${data.customer.id.slice(0, 8).toUpperCase()}`;

  // V19.8.5 — show the active date window in the subtitle so the
  // printed sheet is self-explanatory. Falls back to "all history"
  // when no filters are set.
  const rangeLabel = from && to
    ? `من ${from} إلى ${to}`
    : from
      ? `من ${from}`
      : to
        ? `حتى ${to}`
        : 'كامل السجل';
  const subtitle = `${customerName} — ${customerPhone} • ${rangeLabel}`;

  const status: {
    label: string;
    kind: 'approved' | 'rejected' | 'pending' | 'paid';
  } = debtK > 0
    ? { label: `مديونية: ${formatKwdLabel(debtK)}`, kind: 'rejected' }
    : balK > 0
      ? { label: `رصيد: ${formatKwdLabel(balK)}`, kind: 'paid' }
      : { label: 'حساب متوازن', kind: 'approved' };

  // V19.8.6 — the statement page is opened via `window.open(..., '_blank')`
  // from the Customer 360 panel, so the browser history on this tab is
  // empty and the default `navigate(-1)` back handler in PrintableSheet
  // is a no-op (user feedback: "زر الرجوع مو شغال"). Fall back to
  // closing the tab when there is nothing to go back to; only scripts
  // that opened the tab can close it, which matches this flow exactly.
  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.close();
    }
  };

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
      onBack={handleBack}
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
              {formatKwdLabel(totals.totalOpenDebt)}
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
          </div>
        ) : null}
      </section>

      {/* ─── 3. Financial transactions (the star of the show) ──── */}
      <section className="printable-sheet__section">
        <h3 className="printable-sheet__section-title">
          الحركة المالية ({data.events.length})
        </h3>
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

      {/* ─── 4. Invoice listing ─────────────────────────────────── */}
      <section className="printable-sheet__section">
        <h3 className="printable-sheet__section-title">
          الفواتير ({data.invoices.length})
        </h3>
        {data.invoices.length === 0 ? (
          <p className="stmt-empty">لا توجد فواتير مسجّلة.</p>
        ) : (
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
              {data.invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className={inv.openDebt ? 'stmt-invoice-open' : undefined}
                >
                  <td>#{inv.serial ?? inv.id.slice(0, 8)}</td>
                  <td>
                    {formatDate(inv.completedAtIso ?? inv.createdAtIso)}
                  </td>
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
            <tfoot>
              <tr>
                <td colSpan={4}>إجمالي الفواتير غير المسدّدة</td>
                <td style={{ textAlign: 'end', color: '#b91c1c' }}>
                  {formatKwdLabel(totals.totalOpenDebt)}
                </td>
              </tr>
            </tfoot>
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

/**
 * Renders one ledger event as a main `<tr>` + an optional expanded
 * `<tr>` that shows the activation breakdown (money flow + auto-closed
 * invoices). Split into a component so the big `map(...)` stays clean.
 */
function EventRows({ event: e }: { event: CustomerLedgerEvent }) {
  const label = EVENT_KIND_AR[e.kind] ?? e.kind;
  const planTag = e.subscriptionLabel ? ` — ${e.subscriptionLabel}` : '';
  const ref = e.orderSerial ? `#${e.orderSerial}` : '—';
  const debtAfter = Number.parseFloat(e.debtAfterKd) || 0;
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
          {KD_FMT_4(e.debtAfterKd)}
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
                    label="رصيد مرحّل"
                    value={KD_FMT_4(e.activationBreakdown.carriedBalanceKd)}
                  />
                ) : null}
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
  tone?: 'info' | 'success';
}) {
  const cls =
    tone === 'success'
      ? 'stmt-bd-row stmt-bd-success'
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
