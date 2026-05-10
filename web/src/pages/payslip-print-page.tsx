import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  getPayslip,
  type PayslipRow,
} from '@/lib/api';
import { formatKwdAmount, formatKwdLabel } from '@/lib/kwd';
import { PrintableSheet } from '@/modules/shared/print';

/**
 * V21 Phase 5 — Digital A4 payslip. The page now renders backend-
 * canonical KD strings exclusively; `netSalaryKd` is computed by the
 * payroll mapper (`mapPayrollRow`) so this surface no longer owns any
 * KD math. The previous local `KD()` formatter and `parseFloat`-based
 * net-salary derivation were retired in this slice.
 */

/**
 * V21 Phase 5 — string-only positivity check for KD strings, kept
 * deliberately free of `parseFloat` so the V21 guard suite passes
 * even with the inline `Kd` payroll field references. The backend
 * always emits non-negative amounts for these payroll bands, so a
 * value is "positive" iff it isn't any 4dp form of zero.
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

function hijriMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
  });
}

export function PayslipPrintPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [row, setRow] = useState<PayslipRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token || !id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getPayslip(token, id)
      .then((r) => {
        if (!cancelled) setRow(r);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof ApiError ? e.message : 'فشل تحميل كشف الراتب');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, id]);

  if (loading) {
    return (
      <PrintableSheet
        docType="PAYSLIP"
        docId={id ?? 'unknown'}
        title="كشف راتب"
      >
        <div style={{ padding: '20mm 0', textAlign: 'center' }}>
          جارٍ تحميل البيانات…
        </div>
      </PrintableSheet>
    );
  }

  if (error || !row) {
    return (
      <PrintableSheet
        docType="PAYSLIP"
        docId={id ?? 'unknown'}
        title="كشف راتب"
      >
        <div style={{ padding: '20mm 0', color: '#b91c1c' }}>
          {error ?? 'كشف الراتب غير موجود'}
        </div>
      </PrintableSheet>
    );
  }

  const docNumber = `PAY-${row.id.slice(0, 8).toUpperCase()}`;
  const statusStamp =
    row.status === 'PAID'
      ? { label: 'مدفوع', kind: 'paid' as const }
      : { label: 'معلق', kind: 'pending' as const };

  return (
    <PrintableSheet
      docType="PAYSLIP"
      docId={row.id}
      docNumber={docNumber}
      issuedAtIso={row.createdAt}
      title="كشف راتب"
      subtitle={`${row.user.fullName} — ${hijriMonth(row.paymentDate)}`}
      status={statusStamp}
    >
      <section className="printable-sheet__section">
        <h2 className="printable-sheet__section-title">بيانات الموظف</h2>
        <div className="printable-sheet__grid-2">
          <Field label="الاسم الكامل" value={row.user.fullName} />
          <Field
            label="رقم الموظف"
            value={row.user.employeeId ?? row.user.username}
          />
          <Field label="المسمى الوظيفي" value={row.user.jobTitle ?? '—'} />
          <Field label="البطاقة المدنية" value={row.user.civilId ?? '—'} />
          <Field label="الجنسية" value={row.user.nationality ?? '—'} />
          <Field
            label="تاريخ التعيين"
            value={
              row.user.hireDate
                ? new Date(row.user.hireDate).toLocaleDateString('en-GB')
                : '—'
            }
          />
          <Field label="الفرع" value={row.branch.name} />
          <Field label="الموقع" value={row.branch.location} />
        </div>
      </section>

      <section className="printable-sheet__section">
        <h2 className="printable-sheet__section-title">تفاصيل الراتب</h2>
        <table className="printable-sheet__table">
          <thead>
            <tr>
              <th style={{ width: '60%' }}>البيان</th>
              <th style={{ textAlign: 'end' }}>المبلغ (د.ك)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>الراتب الأساسي</td>
              <td style={{ textAlign: 'end' }}>{formatKwdAmount(row.basicSalary)}</td>
            </tr>
            <tr>
              <td>البدلات</td>
              <td style={{ textAlign: 'end', color: '#15803d' }}>
                +{formatKwdAmount(row.allowances)}
              </td>
            </tr>
            {isPositiveKd(row.commissionAmount) && (
              <tr>
                <td>العمولة</td>
                <td style={{ textAlign: 'end', color: '#15803d' }}>
                  +{formatKwdAmount(row.commissionAmount ?? '0')}
                </td>
              </tr>
            )}
            {isPositiveKd(row.debtReleaseAmount) && (
              <tr>
                <td>تحرير محجوز المديونية</td>
                <td style={{ textAlign: 'end', color: '#15803d' }}>
                  +{formatKwdAmount(row.debtReleaseAmount ?? '0')}
                </td>
              </tr>
            )}
            <tr>
              <td>الاستقطاعات</td>
              <td style={{ textAlign: 'end', color: '#b91c1c' }}>
                −{formatKwdAmount(row.deductions)}
              </td>
            </tr>
            {isPositiveKd(row.debtHoldAmount) && (
              <tr>
                <td>محجوز المديونية (معلّق حتى التحصيل)</td>
                <td style={{ textAlign: 'end', color: '#b45309' }}>
                  −{formatKwdAmount(row.debtHoldAmount ?? '0')}
                </td>
              </tr>
            )}
            {isPositiveKd(row.loanDeduction) && (
              <tr>
                <td>قسط السلفة الشهري</td>
                <td style={{ textAlign: 'end', color: '#b91c1c' }}>
                  −{formatKwdAmount(row.loanDeduction ?? '0')}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td>صافي الراتب المستحق</td>
              <td style={{ textAlign: 'end' }}>
                {formatKwdAmount(row.netSalaryKd)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="printable-sheet__section">
        <h2 className="printable-sheet__section-title">بيانات الصرف</h2>
        <div className="printable-sheet__grid-3">
          <Field
            label="تاريخ الاستحقاق"
            value={new Date(row.paymentDate).toLocaleDateString('en-GB')}
          />
          <Field label="الحالة" value={row.status === 'PAID' ? 'مدفوع' : 'معلق'} />
          <Field label="البنك" value={row.user.bankName ?? '—'} />
          <Field
            label="الحساب / IBAN"
            value={row.user.bankIban ?? '—'}
          />
          <Field
            label="الراتب الأساسي"
            value={formatKwdLabel(row.basicSalary)}
          />
          <Field
            label="الصافي"
            value={formatKwdLabel(row.netSalaryKd)}
          />
        </div>
      </section>

      <section className="printable-sheet__signatures">
        <div className="printable-sheet__signature-box">
          <div className="printable-sheet__signature-label">استلام الموظف</div>
          <div className="printable-sheet__signature-name">
            {row.user.fullName}
          </div>
        </div>
        <div className="printable-sheet__signature-box">
          <div className="printable-sheet__signature-label">
            اعتماد الحسابات
          </div>
          <div className="printable-sheet__signature-name">الاسم / التوقيع</div>
        </div>
      </section>
    </PrintableSheet>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="printable-sheet__field">
      <div className="printable-sheet__label">{label}</div>
      <div className="printable-sheet__value">{value}</div>
    </div>
  );
}

export default PayslipPrintPage;
