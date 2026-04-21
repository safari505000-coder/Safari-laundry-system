import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { ApiError, getLeave, type LeaveRow } from '@/lib/api';
import { PrintableSheet } from '@/modules/shared/print';

/**
 * Stage-D — Leave request A4 printable. Mirrors the on-screen row
 * (employee, dates, days, reason, status) with a QR that resolves to
 * the public `/api/verify/leave_request/:id` endpoint.
 */

const TYPE_LABEL: Record<LeaveRow['type'], string> = {
  ANNUAL: 'إجازة سنوية',
  SICK: 'إجازة مرضية',
  UNPAID: 'إجازة بدون راتب',
  EMERGENCY: 'إجازة طارئة',
};

const STATUS_STAMP: Record<
  LeaveRow['status'],
  { label: string; kind: 'approved' | 'rejected' | 'pending' | 'paid' }
> = {
  APPROVED: { label: 'معتمدة', kind: 'approved' },
  REJECTED: { label: 'مرفوضة', kind: 'rejected' },
  PENDING: { label: 'بانتظار الاعتماد', kind: 'pending' },
  CANCELLED: { label: 'ملغاة', kind: 'rejected' },
};

export function LeaveRequestPrintPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [row, setRow] = useState<LeaveRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    getLeave(token, id)
      .then(setRow)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : 'تعذّر تحميل الطلب'),
      );
  }, [token, id]);

  if (error) {
    return <div className="p-8 text-center text-rose-400">{error}</div>;
  }
  if (!row) {
    return <div className="p-8 text-center text-slate-400">جارٍ التحميل…</div>;
  }

  const docNumber = `LV-${row.id.slice(0, 8).toUpperCase()}`;

  return (
    <PrintableSheet
      docType="LEAVE_REQUEST"
      docId={row.id}
      docNumber={docNumber}
      issuedAtIso={row.createdAt}
      title="طلب إجازة"
      subtitle={`${row.user.fullName} — ${TYPE_LABEL[row.type]}`}
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
        <div className="printable-sheet__section-title">تفاصيل الإجازة</div>
        <div className="printable-sheet__grid-3">
          <Field label="نوع الإجازة" value={TYPE_LABEL[row.type]} />
          <Field label="من تاريخ" value={row.startDate} mono />
          <Field label="إلى تاريخ" value={row.endDate} mono />
          <Field label="عدد الأيام" value={String(row.daysCount)} />
          <Field
            label="تاريخ تقديم الطلب"
            value={new Date(row.createdAt).toLocaleDateString('en-GB')}
          />
          <Field
            label="الحالة الحالية"
            value={STATUS_STAMP[row.status].label}
          />
        </div>
      </section>

      {row.reason ? (
        <section className="printable-sheet__section">
          <div className="printable-sheet__section-title">سبب الإجازة</div>
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

      {row.status === 'APPROVED' || row.status === 'REJECTED' ? (
        <section className="printable-sheet__section">
          <div className="printable-sheet__section-title">
            {row.status === 'APPROVED' ? 'تفاصيل الاعتماد' : 'تفاصيل الرفض'}
          </div>
          <div className="printable-sheet__grid-2">
            <Field
              label={row.status === 'APPROVED' ? 'اعتمده' : 'رفضه'}
              value={row.approvedBy?.fullName ?? '—'}
            />
            <Field
              label={
                row.status === 'APPROVED'
                  ? 'تاريخ الاعتماد'
                  : 'تاريخ الرفض'
              }
              value={
                row.approvedAt
                  ? new Date(row.approvedAt).toLocaleString('en-GB')
                  : '—'
              }
            />
          </div>
          {row.status === 'REJECTED' && row.rejectedReason ? (
            <p
              style={{
                marginTop: '3mm',
                fontSize: '10.5pt',
                padding: '3mm 4mm',
                background: '#fee2e2',
                color: '#991b1b',
                borderRadius: '2mm',
              }}
            >
              {row.rejectedReason}
            </p>
          ) : null}
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

export default LeaveRequestPrintPage;
