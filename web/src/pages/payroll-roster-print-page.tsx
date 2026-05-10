import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  apiJson,
  listPayrollAdhocLines,
  type BranchRow,
  type PayrollAdHocLineRow,
  type PayrollRow,
} from '@/lib/api';
import { formatKwdAmount, sumKwdStrings } from '@/lib/kwd';
import { PrintableSheet } from '@/modules/shared/print';
import {
  compareBranchesForPayrollRoster,
  comparePayrollRowsForRoster,
} from '@/lib/payroll-roster-sort';

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

/**
 * V21 Phase 5 — render-only formatter routed through the canonical
 * `formatKwdAmount` from `@/lib/kwd`. The previous local `KD()` was
 * a duplicate of the shared formatter and is gone.
 */
const KD = (s: string | number) => formatKwdAmount(s);

/**
 * V21 Phase 5 — string-only positivity check for KD strings, kept
 * deliberately free of `parseFloat`. Backend always emits
 * non-negative payroll bands, so a value is "positive" iff it isn't
 * any 4dp form of zero.
 */
function isPositiveKd(s: string | null | undefined): boolean {
  if (!s) return false;
  if (s.startsWith('-')) return false;
  const trimmed = s.trim();
  return (
    trimmed !== '' &&
    trimmed !== '0' &&
    trimmed !== '0.000' &&
    trimmed !== '0.0000'
  );
}

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
  adhoc: PayrollAdHocLineRow[];
};

export function PayrollRosterPrintPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ym = params.get('ym') ?? params.get('m') ?? '';
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
  const [adhocLines, setAdhocLines] = useState<PayrollAdHocLineRow[]>([]);
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
      listPayrollAdhocLines(token, ym, branchId ?? undefined),
    ])
      .then(([p, b, ad]) => {
        if (cancelled) return;
        setRows(Array.isArray(p) ? p : []);
        setBranches(Array.isArray(b) ? b : []);
        setAdhocLines(Array.isArray(ad) ? ad : []);
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
    const ensureAdhocBucket = (branchKey: string): BranchGroup => {
      let g = byBranch.get(branchKey);
      if (g) return g;
      const br = branchesById.get(branchKey);
      g = {
        branch:
          br ??
          ({
            id: branchKey,
            name: 'بدون فرع',
            location: '',
            phone: '',
            isActive: true,
            isAdministrative: false,
            payrollRosterSortOrder: null,
            updatedAt: new Date().toISOString(),
          } as BranchRow),
        rows: [],
        adhoc: [],
      };
      byBranch.set(branchKey, g);
      return g;
    };

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
                payrollRosterSortOrder:
                  branchesById.get(r.branchId)?.payrollRosterSortOrder ??
                  r.branch?.payrollRosterSortOrder,
                updatedAt: new Date().toISOString(),
              } as BranchRow)
            : null,
          rows: [r],
          adhoc: [],
        });
      }
    }

    const adhocFiltered = (adhocLines ?? []).filter(
      (a) =>
        a.periodYm === ym &&
        (!branchId || a.branchId === branchId),
    );
    for (const a of adhocFiltered) {
      const g = ensureAdhocBucket(a.branchId);
      g.adhoc.push(a);
    }

    for (const g of byBranch.values()) {
      g.rows.sort(comparePayrollRowsForRoster);
      g.adhoc.sort(
        (x, y) =>
          x.lineSort - y.lineSort || x.createdAt.localeCompare(y.createdAt),
      );
    }
    return Array.from(byBranch.values()).sort((a, b) =>
      compareBranchesForPayrollRoster(
        {
          name: a.branch?.name ?? '',
          payrollRosterSortOrder: a.branch?.payrollRosterSortOrder,
        },
        {
          name: b.branch?.name ?? '',
          payrollRosterSortOrder: b.branch?.payrollRosterSortOrder,
        },
      ),
    );
  }, [rows, branchesById, adhocLines, ym, branchId]);

  /**
   * V21 Phase 5 — every grand-total band is summed via the single
   * canonical `sumKwdStrings` helper so the page no longer owns any
   * KD math primitive. `netSalaryKd` is supplied by the backend
   * mapper (`mapPayrollRow` / `mapPayrollAdHocLine`) so payroll's
   * canonical net is the only source of truth.
   */
  const totals = useMemo(() => {
    const adhocFiltered = (adhocLines ?? []).filter(
      (a) => a.periodYm === ym && (!branchId || a.branchId === branchId),
    );
    const payrollRows = rows ?? [];
    return {
      basicKd: sumKwdStrings([
        ...payrollRows.map((r) => r.basicSalary),
        ...adhocFiltered.map((a) => a.basicSalary),
      ]),
      allowKd: sumKwdStrings([
        ...payrollRows.map((r) => r.allowances),
        ...adhocFiltered.map((a) => a.allowances),
      ]),
      deductionsKd: sumKwdStrings([
        ...payrollRows.map((r) => r.deductions),
        ...adhocFiltered.map((a) => a.deductions),
      ]),
      commissionKd: sumKwdStrings(payrollRows.map((r) => r.commissionAmount)),
      holdKd: sumKwdStrings(payrollRows.map((r) => r.debtHoldAmount)),
      loanKd: sumKwdStrings(payrollRows.map((r) => r.loanDeduction)),
      netKd: sumKwdStrings([
        ...payrollRows.map((r) => r.netSalaryKd),
        ...adhocFiltered.map((a) => a.netSalaryKd),
      ]),
    };
  }, [rows, adhocLines, ym, branchId]);

  // V19.21 — auto-launch the print dialog once the data has
  // rendered so the Owner doesn't need a second click. Guarded by
  // `loading` to avoid firing while the sheet is still empty.
  useEffect(() => {
    if (loading || error) return;
    const rowCount = rows?.length ?? 0;
    const adCount = (adhocLines ?? []).filter(
      (a) =>
        a.periodYm === ym &&
        (!branchId || a.branchId === branchId),
    ).length;
    if (rowCount === 0 && adCount === 0) return;
    const t = window.setTimeout(() => window.print(), 450);
    return () => window.clearTimeout(t);
  }, [loading, error, rows, adhocLines, ym, branchId]);

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
  const hasCommission = (rows ?? []).some((r) =>
    isPositiveKd(r.commissionAmount),
  );
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

  const adhocForScope = (adhocLines ?? []).filter(
    (a) => a.periodYm === ym && (!branchId || a.branchId === branchId),
  );
  if ((!rows || rows.length === 0) && adhocForScope.length === 0) {
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
          لا توجد سجلات راتب أو سطور يدوية لهذا الشهر.
        </div>
      </PrintableSheet>
    );
  }

  // # + الموظف + رقم الحساب + data cols — `nCurr` below + 2 for # and name.
  const colCount = 7 + (hasCommission ? 1 : 0) + 2;

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
            label="عدد الصفوف"
            value={String((rows?.length ?? 0) + adhocForScope.length)}
            tone="neutral"
          />
          <SummaryStat
            label="إجمالي الأساسي + البدلات"
            value={KD(sumKwdStrings([totals.basicKd, totals.allowKd]))}
            tone="neutral"
          />
          {hasCommission && (
            <SummaryStat
              label="العمولات"
              value={`+${KD(totals.commissionKd)}`}
              tone="good"
            />
          )}
          <SummaryStat
            label="الاستقطاعات"
            value={`−${KD(totals.deductionsKd)}`}
            tone="bad"
          />
          <SummaryStat
            label="محجوز المديونية"
            value={
              isPositiveKd(totals.holdKd)
                ? `−${KD(totals.holdKd)}`
                : KD('0')
            }
            tone="warn"
          />
          <SummaryStat
            label="أقساط السلف"
            value={
              isPositiveKd(totals.loanKd)
                ? `−${KD(totals.loanKd)}`
                : KD('0')
            }
            tone="bad"
          />
          <SummaryStat
            label="الصافي المستحق"
            value={KD(totals.netKd)}
            tone="good"
            emphasis
          />
        </div>
      </section>

      {groups.map((g, idx) => {
        // V21 Phase 5 — per-branch totals routed through canonical
        // `sumKwdStrings`. The previous local `for…of` + `f()` blocks
        // were retired so this surface no longer owns any KD math.
        const bBasicKd = sumKwdStrings([
          ...g.rows.map((r) => r.basicSalary),
          ...g.adhoc.map((a) => a.basicSalary),
        ]);
        const bAllowKd = sumKwdStrings([
          ...g.rows.map((r) => r.allowances),
          ...g.adhoc.map((a) => a.allowances),
        ]);
        const bDedKd = sumKwdStrings([
          ...g.rows.map((r) => r.deductions),
          ...g.adhoc.map((a) => a.deductions),
        ]);
        const bComKd = sumKwdStrings(g.rows.map((r) => r.commissionAmount));
        const bHoldKd = sumKwdStrings(g.rows.map((r) => r.debtHoldAmount));
        const bLoanKd = sumKwdStrings(g.rows.map((r) => r.loanDeduction));
        const bNetKd = sumKwdStrings([
          ...g.rows.map((r) => r.netSalaryKd),
          ...g.adhoc.map((a) => a.netSalaryKd),
        ]);
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
                {g.rows.length + g.adhoc.length} صف — صافي {KD(bNetKd)} د.ك
              </span>
            </div>
            <table className="printable-sheet__table roster-table">
              {/*
                V19.22 — `table-layout: fixed` + explicit % widths so
                the employee name column is never pushed off the page
                when the sheet prints in A4 landscape.
              */}
              {(() => {
                const nCurr = 7 + (hasCommission ? 1 : 0);
                const wRest = 63 / nCurr;
                return (
                  <colgroup>
                    <col style={{ width: '3%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '14%' }} />
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
                  <th>رقم الحساب</th>
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
                    <td
                      className="roster-iban"
                      style={{
                        fontSize: '8.5pt',
                        direction: 'ltr',
                        textAlign: 'start',
                        wordBreak: 'break-all',
                      }}
                    >
                      {r.user.bankIban?.trim() ? r.user.bankIban : '—'}
                    </td>
                    <td className="roster-num">{KD(r.basicSalary)}</td>
                    <td className="roster-num">{KD(r.allowances)}</td>
                    <td className="roster-num roster-neg">
                      {isPositiveKd(r.deductions)
                        ? `−${KD(r.deductions)}`
                        : '—'}
                    </td>
                    {hasCommission && (
                      <td className="roster-num roster-pos">
                        {isPositiveKd(r.commissionAmount)
                          ? `+${KD(r.commissionAmount)}`
                          : '—'}
                      </td>
                    )}
                    <td
                      className={
                        isPositiveKd(r.debtHoldAmount)
                          ? 'roster-num roster-warn'
                          : 'roster-num'
                      }
                    >
                      {isPositiveKd(r.debtHoldAmount)
                        ? `−${KD(r.debtHoldAmount)}`
                        : KD('0')}
                    </td>
                    <td
                      className={
                        isPositiveKd(r.loanDeduction)
                          ? 'roster-num roster-neg'
                          : 'roster-num'
                      }
                    >
                      {isPositiveKd(r.loanDeduction)
                        ? `−${KD(r.loanDeduction)}`
                        : KD('0')}
                    </td>
                    <td className="roster-num roster-net">
                      {KD(r.netSalaryKd)}
                    </td>
                  </tr>
                ))}
                {g.adhoc.map((a, j) => (
                  <tr key={a.id}>
                    <td className="roster-num">{g.rows.length + j + 1}</td>
                    <td className="roster-col-name">
                      <div className="roster-employee">
                        <span className="roster-employee__name">
                          {a.beneficiaryName}
                        </span>
                        <span className="roster-employee__role">يدوي</span>
                      </div>
                    </td>
                    <td
                      className="roster-iban"
                      style={{
                        fontSize: '8.5pt',
                        direction: 'ltr',
                        textAlign: 'start',
                        wordBreak: 'break-all',
                      }}
                    >
                      {a.bankIban?.trim() ? a.bankIban : '—'}
                    </td>
                    <td className="roster-num">{KD(a.basicSalary)}</td>
                    <td className="roster-num">{KD(a.allowances)}</td>
                    <td className="roster-num roster-neg">
                      {isPositiveKd(a.deductions)
                        ? `−${KD(a.deductions)}`
                        : '—'}
                    </td>
                    {hasCommission && (
                      <td className="roster-num">—</td>
                    )}
                    <td className="roster-num">—</td>
                    <td className="roster-num">—</td>
                    <td className="roster-num roster-net">
                      {KD(a.netSalaryKd)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ textAlign: 'start' }}>
                    مجموع الفرع
                  </td>
                  <td className="roster-num">—</td>
                  <td className="roster-num">{KD(bBasicKd)}</td>
                  <td className="roster-num">{KD(bAllowKd)}</td>
                  <td className="roster-num roster-neg">
                    {isPositiveKd(bDedKd) ? `−${KD(bDedKd)}` : '—'}
                  </td>
                  {hasCommission && (
                    <td className="roster-num roster-pos">
                      {isPositiveKd(bComKd) ? `+${KD(bComKd)}` : '—'}
                    </td>
                  )}
                  <td
                    className={
                      isPositiveKd(bHoldKd)
                        ? 'roster-num roster-warn'
                        : 'roster-num'
                    }
                  >
                    {isPositiveKd(bHoldKd) ? `−${KD(bHoldKd)}` : KD('0')}
                  </td>
                  <td
                    className={
                      isPositiveKd(bLoanKd)
                        ? 'roster-num roster-neg'
                        : 'roster-num'
                    }
                  >
                    {isPositiveKd(bLoanKd) ? `−${KD(bLoanKd)}` : KD('0')}
                  </td>
                  <td className="roster-num roster-net">{KD(bNetKd)}</td>
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
            <dd>
              {KD(sumKwdStrings([totals.basicKd, totals.allowKd]))} د.ك
            </dd>
          </div>
          {hasCommission && (
            <div className="printable-sheet__total-row">
              <dt>العمولات</dt>
              <dd style={{ color: '#15803d' }}>
                +{KD(totals.commissionKd)} د.ك
              </dd>
            </div>
          )}
          <div className="printable-sheet__total-row">
            <dt>الاستقطاعات</dt>
            <dd style={{ color: '#b91c1c' }}>
              −{KD(totals.deductionsKd)} د.ك
            </dd>
          </div>
          <div className="printable-sheet__total-row">
            <dt>محجوز المديونية</dt>
            <dd
              style={{
                color: isPositiveKd(totals.holdKd) ? '#b45309' : undefined,
              }}
            >
              {isPositiveKd(totals.holdKd)
                ? `−${KD(totals.holdKd)}`
                : KD('0')}{' '}
              د.ك
            </dd>
          </div>
          <div className="printable-sheet__total-row">
            <dt>أقساط السلف</dt>
            <dd
              style={{
                color: isPositiveKd(totals.loanKd) ? '#b91c1c' : undefined,
              }}
            >
              {isPositiveKd(totals.loanKd)
                ? `−${KD(totals.loanKd)}`
                : KD('0')}{' '}
              د.ك
            </dd>
          </div>
          <div className="printable-sheet__total-row printable-sheet__total-row--grand">
            <dt>الصافي الكلي المستحق</dt>
            <dd>{KD(totals.netKd)} د.ك</dd>
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
