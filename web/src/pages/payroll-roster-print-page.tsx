import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  apiJson,
  type BranchRow,
  type PayrollRow,
} from '@/lib/api';
import { PrintableSheet } from '@/modules/shared/print';

/**
 * V19.21 — Digital A4 «مسير الرواتب الشهري».
 *
 * A dedicated printable route so the monthly roster gets the same
 * brand-chrome, QR stamp, and print-ready layout as every other HR
 * document instead of trying to re-skin the unified data-entry page
 * via `@media print` hacks. The route is query-string driven:
 *
 *   /payroll-roster-print?ym=YYYY-MM
 *   /payroll-roster-print?ym=YYYY-MM&branchId=<uuid>
 *
 * Opens in a new tab from the unified page ("طباعة المسير الرسمي")
 * and auto-triggers `window.print()` once the data is loaded. The
 * QR at the footer encodes the same token that the verify endpoint
 * expects (`YYYY-MM` or `YYYY-MM_<branchId>`) so scanning returns
 * the identical totals that were printed on the sheet.
 */

const KD = (s: string | number) => {
  const n = typeof s === 'number' ? s : Number.parseFloat(s);
  if (!Number.isFinite(n)) return String(s);
  return n.toLocaleString('en-GB', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
};

const f = (s: string | null | undefined) => {
  if (!s) return 0;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

function monthRangeIso(ym: string): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  const [ys, ms] = ym.split('-');
  const y = Number.parseInt(ys ?? '0', 10);
  const m = Number.parseInt(ms ?? '1', 10);
  if (!y || !m || m < 1 || m > 12) return null;
  const from = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const to = new Date(y, m, 0, 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * V19.22 — Debt release was separated from the payroll cycle into its
 * own disbursement flow, so it no longer contributes to the payroll
 * net here (and is not shown as a column). Loan installment and
 * debt hold stay inside payroll as deductions.
 */
function payrollNet(row: PayrollRow): number {
  return (
    f(row.basicSalary) +
    f(row.allowances) +
    f(row.commissionAmount) -
    f(row.deductions) -
    f(row.debtHoldAmount) -
    f(row.loanDeduction)
  );
}

function monthLabelAr(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [ys, ms] = ym.split('-');
  const y = Number.parseInt(ys ?? '0', 10);
  const m = Number.parseInt(ms ?? '1', 10);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('ar-KW', {
    month: 'long',
    year: 'numeric',
  });
}

type BranchGroup = {
  branch: BranchRow | null;
  rows: PayrollRow[];
};

export function PayrollRosterPrintPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ym = params.get('ym') ?? '';
  const branchId = params.get('branchId');

  // New tabs opened via `window.open` have no history — `navigate(-1)` is
  // a no-op. Always return to the payroll tab with the same month/branch.
  const onBackToStaffHub = useCallback(() => {
    const sp = new URLSearchParams();
    sp.set('tab', 'payroll');
    if (ym) sp.set('ym', ym);
    if (branchId) sp.set('branchId', branchId);
    navigate(`/staff-hub?${sp.toString()}`);
  }, [navigate, ym, branchId]);

  const [rows, setRows] = useState<PayrollRow[] | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token || !ym) {
      setLoading(false);
      setError(ym ? 'لا توجد جلسة صالحة' : 'لم يُحدَّد الشهر');
      return;
    }
    const range = monthRangeIso(ym);
    if (!range) {
      setLoading(false);
      setError('صيغة الشهر غير صحيحة');
      return;
    }
    const qs = new URLSearchParams(range);
    if (branchId) qs.set('branchId', branchId);
    setLoading(true);
    Promise.all([
      apiJson<PayrollRow[]>(`/api/payroll?${qs.toString()}`, { token }),
      apiJson<BranchRow[]>('/api/branches', { token }),
    ])
      .then(([p, b]) => {
        if (cancelled) return;
        setRows(Array.isArray(p) ? p : []);
        setBranches(Array.isArray(b) ? b : []);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(
            e instanceof ApiError ? e.message : 'تعذّر تحميل مسير الرواتب',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, ym, branchId]);

  const branchesById = useMemo(
    () => new Map(branches.map((b) => [b.id, b])),
    [branches],
  );

  const groups: BranchGroup[] = useMemo(() => {
    const byBranch = new Map<string, BranchGroup>();
    for (const r of rows ?? []) {
      const key = r.branchId || '__unassigned__';
      const bucket = byBranch.get(key);
      if (bucket) {
        bucket.rows.push(r);
      } else {
        byBranch.set(key, {
          branch: branchesById.get(r.branchId) ?? r.branch
            ? ({
                id: r.branchId,
                name: r.branch?.name ?? 'بدون فرع',
                location: branchesById.get(r.branchId)?.location ?? '',
                phone: branchesById.get(r.branchId)?.phone ?? '',
                isActive: true,
                isAdministrative:
                  branchesById.get(r.branchId)?.isAdministrative ?? false,
                updatedAt: new Date().toISOString(),
              } as BranchRow)
            : null,
          rows: [r],
        });
      }
    }
    for (const g of byBranch.values()) {
      g.rows.sort((a, b) =>
        a.user.fullName.localeCompare(b.user.fullName, 'ar'),
      );
    }
    return Array.from(byBranch.values()).sort((a, b) =>
      (a.branch?.name ?? '').localeCompare(b.branch?.name ?? '', 'ar'),
    );
  }, [rows, branchesById]);

  const totals = useMemo(() => {
    let basic = 0;
    let allow = 0;
    let deductions = 0;
    let commission = 0;
    let hold = 0;
    let loan = 0;
    let net = 0;
    for (const r of rows ?? []) {
      basic += f(r.basicSalary);
      allow += f(r.allowances);
      deductions += f(r.deductions);
      commission += f(r.commissionAmount);
      hold += f(r.debtHoldAmount);
      loan += f(r.loanDeduction);
      net += payrollNet(r);
    }
    return { basic, allow, deductions, commission, hold, loan, net };
  }, [rows]);

  // V19.21 — auto-launch the print dialog once the data has
  // rendered so the Owner doesn't need a second click. Guarded by
  // `loading` to avoid firing while the sheet is still empty.
  useEffect(() => {
    if (loading || error) return;
    if (!rows || rows.length === 0) return;
    const t = window.setTimeout(() => window.print(), 450);
    return () => window.clearTimeout(t);
  }, [loading, error, rows]);

  const docNumber = `PAYROLL-${ym.replace(/-/g, '')}${
    branchId ? `-${branchId.slice(0, 6).toUpperCase()}` : ''
  }`;
  const docId = branchId ? `${ym}_${branchId}` : ym;
  const branchName = branchId ? branchesById.get(branchId)?.name ?? '—' : null;
  const subtitle = branchName
    ? `${monthLabelAr(ym)} — فرع ${branchName}`
    : `${monthLabelAr(ym)} — جميع الفروع`;

  // V19.22 — Commission is still conditional (some branches/months
  // have zero commission and we don't want a dead column). But debt
  // hold and loan installments are core payroll deductions now and
  // must ALWAYS show — even with a zero value — so the Owner can see
  // at a glance that they've been accounted for. Debt release was
  // moved to its own disbursement flow and removed here.
  const hasCommission = (rows ?? []).some((r) => f(r.commissionAmount) > 0);
  // V19.22 — debt hold + loan installment columns are ALWAYS rendered
  // (see column layout below) so the Owner can see zero values as
  // explicit proof they've been accounted for. No flags needed.

  if (loading) {
    return (
      <PrintableSheet
        docType="PAYROLL_ROSTER"
        docId={docId}
        docNumber={docNumber}
        title="مسير الرواتب الشهري"
        subtitle={subtitle}
        sheetClassName="printable-sheet--roster"
        onBack={onBackToStaffHub}
      >
        <div style={{ padding: '20mm 0', textAlign: 'center' }}>
          جارٍ تحميل بيانات المسير…
        </div>
      </PrintableSheet>
    );
  }

  if (error) {
    return (
      <PrintableSheet
        docType="PAYROLL_ROSTER"
        docId={docId}
        docNumber={docNumber}
        title="مسير الرواتب الشهري"
        subtitle={subtitle}
        sheetClassName="printable-sheet--roster"
        onBack={onBackToStaffHub}
      >
        <div style={{ padding: '20mm 0', color: '#b91c1c' }}>{error}</div>
      </PrintableSheet>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <PrintableSheet
        docType="PAYROLL_ROSTER"
        docId={docId}
        docNumber={docNumber}
        title="مسير الرواتب الشهري"
        subtitle={subtitle}
        sheetClassName="printable-sheet--roster"
        onBack={onBackToStaffHub}
      >
        <div
          style={{
            padding: '20mm 0',
            textAlign: 'center',
            color: '#64748b',
          }}
        >
          لا توجد سجلات راتب محفوظة لهذا الشهر.
        </div>
      </PrintableSheet>
    );
  }

  // 4 fixed (# + الموظف + أساسي + بدلات + خصم) + hold + loan + net,
  // plus optional commission column.
  const colCount = 7 + (hasCommission ? 1 : 0) + 1;

  return (
    <PrintableSheet
      docType="PAYROLL_ROSTER"
      docId={docId}
      docNumber={docNumber}
      title="مسير الرواتب الشهري"
      subtitle={subtitle}
      status={{ label: 'معتمد', kind: 'paid' }}
      sheetClassName="printable-sheet--roster"
      onBack={onBackToStaffHub}
    >
      <section className="printable-sheet__section">
        <h2 className="printable-sheet__section-title">ملخص المسير</h2>
        <div className="roster-summary">
          <SummaryStat
            label="عدد المسيرات"
            value={String(rows.length)}
            tone="neutral"
          />
          <SummaryStat
            label="إجمالي الأساسي + البدلات"
            value={KD(totals.basic + totals.allow)}
            tone="neutral"
          />
          {hasCommission && (
            <SummaryStat
              label="العمولات"
              value={`+${KD(totals.commission)}`}
              tone="good"
            />
          )}
          <SummaryStat
            label="الاستقطاعات"
            value={`−${KD(totals.deductions)}`}
            tone="bad"
          />
          <SummaryStat
            label="محجوز المديونية"
            value={totals.hold > 0 ? `−${KD(totals.hold)}` : KD(0)}
            tone="warn"
          />
          <SummaryStat
            label="أقساط السلف"
            value={totals.loan > 0 ? `−${KD(totals.loan)}` : KD(0)}
            tone="bad"
          />
          <SummaryStat
            label="الصافي المستحق"
            value={KD(totals.net)}
            tone="good"
            emphasis
          />
        </div>
      </section>

      {groups.map((g, idx) => {
        let bBasic = 0;
        let bAllow = 0;
        let bDed = 0;
        let bCom = 0;
        let bHold = 0;
        let bLoan = 0;
        let bNet = 0;
        for (const r of g.rows) {
          bBasic += f(r.basicSalary);
          bAllow += f(r.allowances);
          bDed += f(r.deductions);
          bCom += f(r.commissionAmount);
          bHold += f(r.debtHoldAmount);
          bLoan += f(r.loanDeduction);
          bNet += payrollNet(r);
        }
        return (
          <section
            key={g.branch?.id ?? idx}
            className="printable-sheet__section roster-branch"
          >
            <div className="roster-branch__head">
              <h2 className="printable-sheet__section-title roster-branch__title">
                {g.branch?.name ?? 'بدون فرع'}
              </h2>
              <span className="roster-branch__chip">
                {g.rows.length} موظف — صافي {KD(bNet)} د.ك
              </span>
            </div>
            <table className="printable-sheet__table roster-table">
              {/*
                V19.22 — `table-layout: fixed` + explicit % widths so
                the employee name column is never pushed off the page
                when the sheet prints in A4 landscape.
              */}
              {(() => {
                const nCurr = 6 + (hasCommission ? 1 : 0);
                const wRest = 77 / nCurr;
                return (
                  <colgroup>
                    <col style={{ width: '3%' }} />
                    <col style={{ width: '20%' }} />
                    {Array.from({ length: nCurr }, (_, i) => (
                      <col
                        key={i}
                        style={{ width: `${wRest.toFixed(2)}%` }}
                      />
                    ))}
                  </colgroup>
                );
              })()}
              <thead>
                <tr>
                  <th style={{ width: '3%' }}>#</th>
                  <th className="roster-col-name">الموظف</th>
                  <th>الأساسي</th>
                  <th>البدلات</th>
                  <th>الخصم</th>
                  {hasCommission && <th>عمولة</th>}
                  <th>محجوز المديونية</th>
                  <th>قسط السلفة</th>
                  <th>الصافي</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r, i) => (
                  <tr key={r.id}>
                    <td className="roster-num">{i + 1}</td>
                    <td className="roster-col-name">
                      <div className="roster-employee">
                        <span className="roster-employee__name">
                          {r.user.fullName}
                        </span>
                        <span className="roster-employee__role">
                          {r.user.username}
                        </span>
                      </div>
                    </td>
                    <td className="roster-num">{KD(r.basicSalary)}</td>
                    <td className="roster-num">{KD(r.allowances)}</td>
                    <td className="roster-num roster-neg">
                      {f(r.deductions) > 0 ? `−${KD(r.deductions)}` : '—'}
                    </td>
                    {hasCommission && (
                      <td className="roster-num roster-pos">
                        {f(r.commissionAmount) > 0
                          ? `+${KD(r.commissionAmount)}`
                          : '—'}
                      </td>
                    )}
                    <td
                      className={
                        f(r.debtHoldAmount) > 0
                          ? 'roster-num roster-warn'
                          : 'roster-num'
                      }
                    >
                      {f(r.debtHoldAmount) > 0
                        ? `−${KD(r.debtHoldAmount)}`
                        : KD(0)}
                    </td>
                    <td
                      className={
                        f(r.loanDeduction) > 0
                          ? 'roster-num roster-neg'
                          : 'roster-num'
                      }
                    >
                      {f(r.loanDeduction) > 0
                        ? `−${KD(r.loanDeduction)}`
                        : KD(0)}
                    </td>
                    <td className="roster-num roster-net">
                      {KD(payrollNet(r))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ textAlign: 'start' }}>
                    مجموع الفرع
                  </td>
                  <td className="roster-num">{KD(bBasic)}</td>
                  <td className="roster-num">{KD(bAllow)}</td>
                  <td className="roster-num roster-neg">
                    {bDed > 0 ? `−${KD(bDed)}` : '—'}
                  </td>
                  {hasCommission && (
                    <td className="roster-num roster-pos">
                      {bCom > 0 ? `+${KD(bCom)}` : '—'}
                    </td>
                  )}
                  <td
                    className={
                      bHold > 0 ? 'roster-num roster-warn' : 'roster-num'
                    }
                  >
                    {bHold > 0 ? `−${KD(bHold)}` : KD(0)}
                  </td>
                  <td
                    className={
                      bLoan > 0 ? 'roster-num roster-neg' : 'roster-num'
                    }
                  >
                    {bLoan > 0 ? `−${KD(bLoan)}` : KD(0)}
                  </td>
                  <td className="roster-num roster-net">{KD(bNet)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        );
      })}

      <section className="printable-sheet__section">
        <h2 className="printable-sheet__section-title">الإجمالي الكلي</h2>
        <dl className="printable-sheet__totals">
          <div className="printable-sheet__total-row">
            <dt>الأساسي + البدلات</dt>
            <dd>{KD(totals.basic + totals.allow)} د.ك</dd>
          </div>
          {hasCommission && (
            <div className="printable-sheet__total-row">
              <dt>العمولات</dt>
              <dd style={{ color: '#15803d' }}>+{KD(totals.commission)} د.ك</dd>
            </div>
          )}
          <div className="printable-sheet__total-row">
            <dt>الاستقطاعات</dt>
            <dd style={{ color: '#b91c1c' }}>−{KD(totals.deductions)} د.ك</dd>
          </div>
          <div className="printable-sheet__total-row">
            <dt>محجوز المديونية</dt>
            <dd style={{ color: totals.hold > 0 ? '#b45309' : undefined }}>
              {totals.hold > 0 ? `−${KD(totals.hold)}` : KD(0)} د.ك
            </dd>
          </div>
          <div className="printable-sheet__total-row">
            <dt>أقساط السلف</dt>
            <dd style={{ color: totals.loan > 0 ? '#b91c1c' : undefined }}>
              {totals.loan > 0 ? `−${KD(totals.loan)}` : KD(0)} د.ك
            </dd>
          </div>
          <div className="printable-sheet__total-row printable-sheet__total-row--grand">
            <dt>الصافي الكلي المستحق</dt>
            <dd>{KD(totals.net)} د.ك</dd>
          </div>
        </dl>
      </section>

      <section className="printable-sheet__signatures">
        <div className="printable-sheet__signature-box">
          <div className="printable-sheet__signature-label">
            اعتماد الحسابات
          </div>
          <div className="printable-sheet__signature-name">
            الاسم / التوقيع
          </div>
        </div>
        <div className="printable-sheet__signature-box">
          <div className="printable-sheet__signature-label">
            اعتماد الإدارة
          </div>
          <div className="printable-sheet__signature-name">
            الاسم / التوقيع
          </div>
        </div>
      </section>

      {/* Column hint lives only at the top; avoid duplicating on each page. */}
      <div style={{ display: 'none' }} aria-hidden>
        {colCount}
      </div>
    </PrintableSheet>
  );
}

function SummaryStat({
  label,
  value,
  tone,
  emphasis,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'good' | 'warn' | 'bad';
  emphasis?: boolean;
}) {
  const cls = [
    'roster-stat',
    `roster-stat--${tone}`,
    emphasis ? 'roster-stat--emphasis' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls}>
      <div className="roster-stat__label">{label}</div>
      <div className="roster-stat__value">{value}</div>
    </div>
  );
}

export default PayrollRosterPrintPage;
