import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { ApiError, getLoan, type LoanRow } from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { PrintableSheet } from '@/modules/shared/print';

/**
 * Stage-D — Employee loan acknowledgement A4. Matches the screen
 * (amount, monthly installment, remaining, status) and carries an
 * employee-signed declaration authorising payroll deductions.
 */

const STATUS_STAMP: Record<
  LoanRow['status'],
  { label: string; kind: 'approved' | 'rejected' | 'pending' | 'paid' }
> = {
  APPROVED: { label: 'معتمدة', kind: 'approved' },
  ACTIVE: { label: 'جارية الخصم', kind: 'approved' },
  SETTLED: { label: 'مسدّدة', kind: 'paid' },
  PENDING: { label: 'بانتظار الاعتماد', kind: 'pending' },
  REJECTED: { label: 'مرفوضة', kind: 'rejected' },
};

export function LoanPrintPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [row, setRow] = useState<LoanRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    getLoan(token, id)
      .then(setRow)
      .catch((e) =>
        setError(
          e instanceof ApiError ? e.message : 'تعذّر تحميل السلفة',
        ),
      );
  }, [token, id]);

  if (error) {
    return <div className="p-8 text-center text-rose-400">{error}</div>;
  }
  if (!row) {
    return <div className="p-8 text-center text-slate-400">جارٍ التحميل…</div>;
  }

  const docNumber = `LN-${row.id.slice(0, 8).toUpperCase()}`;

  return (
    <PrintableSheet
      docType="EMPLOYEE_LOAN"
      docId={row.id}
      docNumber={docNumber}
      issuedAtIso={row.createdAt}
      title="إقرار سلفة موظف"
      subtitle={`${row.user.fullName}`}
      status={STATUS_STAMP[row.status]}
    >
      <section className="printable-sheet__section">
        <div className="printable-sheet__section-title">بيانات الموظف</div>
        <div className="printable-sheet__grid-2">
          <Field label="الاسم الكامل" value={row.user.fullName} />
          <Field label="اسم المستخدم" value={row.user.username} />
          <Field label="الرقم الوظيفي" value={row.user.employeeId ?? '—'} />
          <Field label="الرقم المدني" value={row.user.civilId ?? '—'} />
          <Field label="المسمى الوظيفي" value={row.user.jobTitle ?? '—'} />
          <Field label="الفرع" value={row.user.branch?.name ?? '—'} />
        </div>
      </section>

      <section className="printable-sheet__section">
        <div className="printable-sheet__section-title">تفاصيل السلفة</div>
        <div className="printable-sheet__grid-3">
          <Field
            label="المبلغ الإجمالي"
            value={formatKwdLabel(row.amount)}
            mono
          />
          <Field
            label="عدد الأقساط"
            value={String(row.installmentCount)}
          />
          <Field
            label="القسط الشهري"
            value={formatKwdLabel(row.monthlyDeduction)}
            mono
          />
          <Field
            label="المدفوع حتى الآن"
            value={formatKwdLabel(row.paidKd)}
            mono
          />
          <Field
            label="المتبقي"
            value={formatKwdLabel(row.remaining)}
            mono
          />
          <Field
            label="تاريخ الطلب"
            value={new Date(row.createdAt).toLocaleDateString('en-GB')}
          />
        </div>
      </section>

      {row.reason ? (
        <section className="printable-sheet__section">
          <div className="printable-sheet__section-title">سبب السلفة</div>
          <p
            style={{
              fontSize: '10.5pt',
              lineHeight: 1.7,
              padding: '3mm 4mm',
              background: 'var(--brand-bg-soft)',
              borderInlineStart: '3px solid var(--brand-accent)',
              borderRadius: '2mm',
            }}
          >
            {row.reason}
          </p>
        </section>
      ) : null}

      <section className="printable-sheet__section">
        <div className="printable-sheet__section-title">إقرار وتفويض</div>
        <p
          style={{
            fontSize: '10.5pt',
            lineHeight: 1.8,
            padding: '3mm 4mm',
            background: '#ecfdf5',
            borderInlineStart: '3px solid var(--brand-primary)',
            borderRadius: '2mm',
          }}
        >
          أقرّ أنا الموظف الموقّع أدناه باستلام مبلغ السلفة المذكور أعلاه،
          وأفوّض قسم الحسابات بخصم القسط الشهري الموضّح من راتبي الشهري
          تلقائياً حتى سداد كامل المبلغ. يسقط هذا الإقرار بمجرد انتقال
          السلفة إلى حالة "مسدّدة" في النظام.
        </p>
      </section>

      {row.status === 'REJECTED' && row.rejectedReason ? (
        <section className="printable-sheet__section">
          <div className="printable-sheet__section-title">سبب الرفض</div>
          <p
            style={{
              fontSize: '10.5pt',
              padding: '3mm 4mm',
              background: '#fee2e2',
              color: '#991b1b',
              borderRadius: '2mm',
            }}
          >
            {row.rejectedReason}
          </p>
        </section>
      ) : null}

      <div className="printable-sheet__signatures">
        <div className="printable-sheet__signature-box">
          <div className="printable-sheet__signature-label">توقيع الموظف</div>
          <div className="printable-sheet__signature-name">
            {row.user.fullName}
          </div>
        </div>
        <div className="printable-sheet__signature-box">
          <div className="printable-sheet__signature-label">
            توقيع المعتمد
          </div>
          <div className="printable-sheet__signature-name">
            {row.approvedBy?.fullName ?? '—'}
          </div>
        </div>
      </div>
    </PrintableSheet>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="printable-sheet__field">
      <span className="printable-sheet__label">{label}</span>
      <span
        className={`printable-sheet__value${
          mono ? ' printable-sheet__value--mono' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export default LoanPrintPage;
