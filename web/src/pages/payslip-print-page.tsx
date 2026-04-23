import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  getPayslip,
  type PayslipRow,
} from '@/lib/api';
import { PrintableSheet } from '@/modules/shared/print';

/**
 * Digital A4 payslip — the on-paper counterpart of the payroll list
 * row. Fully coloured, QR-stamped, and bilingual-friendly (values
 * stay tabular for auditors).
 */

const KD = (s: string) => {
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString('en-GB', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
};

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

  const { basic, net, commission, debtHold, debtRelease } = useMemo(() => {
    if (!row) {
      return { basic: 0, net: 0, commission: 0, debtHold: 0, debtRelease: 0 };
    }
    const b = Number.parseFloat(row.basicSalary);
    const a = Number.parseFloat(row.allowances);
    const d = Number.parseFloat(row.deductions);
    const c = Number.parseFloat(row.commissionAmount ?? '0');
    const h = Number.parseFloat(row.debtHoldAmount ?? '0');
    const r = Number.parseFloat(row.debtReleaseAmount ?? '0');
    return {
      basic: b,
      commission: Number.isFinite(c) ? c : 0,
      debtHold: Number.isFinite(h) ? h : 0,
      debtRelease: Number.isFinite(r) ? r : 0,
      net:
        b +
        a +
        (Number.isFinite(c) ? c : 0) +
        (Number.isFinite(r) ? r : 0) -
        d -
        (Number.isFinite(h) ? h : 0),
    };
  }, [row]);

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
              <td style={{ textAlign: 'end' }}>{KD(row.basicSalary)}</td>
            </tr>
            <tr>
              <td>البدلات</td>
              <td style={{ textAlign: 'end', color: '#15803d' }}>
                +{KD(row.allowances)}
              </td>
            </tr>
            {commission > 0 && (
              <tr>
                <td>العمولة</td>
                <td style={{ textAlign: 'end', color: '#15803d' }}>
                  +{KD(row.commissionAmount ?? '0')}
                </td>
              </tr>
            )}
            {debtRelease > 0 && (
              <tr>
                <td>تحرير محجوز المديونية</td>
                <td style={{ textAlign: 'end', color: '#15803d' }}>
                  +{KD(row.debtReleaseAmount ?? '0')}
                </td>
              </tr>
            )}
            <tr>
              <td>الاستقطاعات</td>
              <td style={{ textAlign: 'end', color: '#b91c1c' }}>
                −{KD(row.deductions)}
              </td>
            </tr>
            {debtHold > 0 && (
              <tr>
                <td>محجوز المديونية (معلّق حتى التحصيل)</td>
                <td style={{ textAlign: 'end', color: '#b45309' }}>
                  −{KD(row.debtHoldAmount ?? '0')}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td>صافي الراتب المستحق</td>
              <td style={{ textAlign: 'end' }}>
                {net.toLocaleString('en-GB', {
                  minimumFractionDigits: 3,
                  maximumFractionDigits: 3,
                })}
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
            value={`${basic.toFixed(3)} د.ك`}
          />
          <Field
            label="الصافي"
            value={`${net.toFixed(3)} د.ك`}
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
