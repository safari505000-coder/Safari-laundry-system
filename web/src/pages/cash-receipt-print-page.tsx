import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  getCashReceipt,
  type ManagerCashCustodyRow,
} from '@/lib/api';
import { PrintableSheet } from '@/modules/shared/print';

/**
 * V19.17 — Driver Cash-Handover Receipt (سند استلام كاش).
 *
 * Formal A4 voucher the branch manager issues to a driver after
 * approving receipt of the driver's CASH custody. The driver, the
 * manager, and the back-office audit roles can all open this page;
 * the QR stamped on the footer resolves to the public
 * `/api/verify/cash_receipt/:id` endpoint so a paper copy can be
 * authenticated without logging in.
 *
 * Layout is intentionally identical to the rest of the HR voucher
 * family (payslip, loan, debt-hold) so the driver's paper trail looks
 * and feels like one coherent document set.
 */

const STATUS_STAMP: Record<
  ManagerCashCustodyRow['status'],
  { label: string; kind: 'approved' | 'rejected' | 'pending' | 'paid' }
> = {
  PENDING_DEPOSIT: { label: 'بانتظار الإيداع', kind: 'pending' },
  AWAITING_VERIFICATION: { label: 'بانتظار التدقيق', kind: 'pending' },
  VERIFIED: { label: 'مُدقَّق', kind: 'approved' },
  REJECTED: { label: 'مرفوض', kind: 'rejected' },
};

function formatKwd3(v: string | number): string {
  const n = typeof v === 'number' ? v : Number.parseFloat(v || '0');
  if (!Number.isFinite(n)) return `${String(v)} د.ك`;
  return `${n.toLocaleString('en-GB', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} د.ك`;
}

export function CashReceiptPrintPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [row, setRow] = useState<ManagerCashCustodyRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    getCashReceipt(token, id)
      .then(setRow)
      .catch((e) =>
        setError(
          e instanceof ApiError ? e.message : 'تعذّر تحميل سند الاستلام',
        ),
      );
  }, [token, id]);

  if (error) {
    return <div className="p-8 text-center text-rose-400">{error}</div>;
  }
  if (!row) {
    return <div className="p-8 text-center text-slate-400">جارٍ التحميل…</div>;
  }

  const docNumber = `CR-${row.id.slice(0, 8).toUpperCase()}`;
  const received = new Date(row.receivedFromDriverAt);

  return (
    <PrintableSheet
      docType="CASH_RECEIPT"
      docId={row.id}
      docNumber={docNumber}
      issuedAtIso={row.receivedFromDriverAt}
      title="سند استلام عهدة نقدية"
      subtitle={`من السائق: ${row.driverName} — إلى مدير الفرع: ${row.managerName}`}
      status={STATUS_STAMP[row.status]}
    >
      <section className="printable-sheet__section">
        <div className="printable-sheet__section-title">بيانات السائق</div>
        <div className="printable-sheet__grid-2">
          <Field label="اسم السائق" value={row.driverName} />
          <Field label="اسم المستخدم" value={row.driverUsername} />
        </div>
      </section>

      <section className="printable-sheet__section">
        <div className="printable-sheet__section-title">بيانات المستلم</div>
        <div className="printable-sheet__grid-2">
          <Field label="مدير الفرع" value={row.managerName} />
          <Field label="اسم المستخدم" value={row.managerUsername} />
          <Field label="هاتف المدير" value={row.managerPhone ?? '—'} />
          <Field label="الفرع" value={row.branchName ?? '—'} />
        </div>
      </section>

      <section className="printable-sheet__section">
        <div className="printable-sheet__section-title">
          تفاصيل المبلغ المستلم
        </div>
        <div className="printable-sheet__grid-3">
          <Field
            label="المبلغ المُستلم"
            value={formatKwd3(row.amountKd)}
            mono
          />
          <Field
            label="عدد الفواتير المُسوّاة"
            value={String(row.settledOrderCount)}
          />
          <Field
            label="تاريخ الاستلام"
            value={received.toLocaleDateString('en-GB')}
          />
          <Field
            label="وقت الاستلام"
            value={received.toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          />
          <Field
            label="حالة الإيداع البنكي"
            value={STATUS_STAMP[row.status].label}
          />
          <Field
            label="رقم المستند"
            value={docNumber}
            mono
          />
        </div>
      </section>

      <section className="printable-sheet__section">
        <div className="printable-sheet__section-title">إقرار الاستلام</div>
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
          أقرّ أنا مدير الفرع الموقّع أدناه باستلام مبلغ{' '}
          <strong>{formatKwd3(row.amountKd)}</strong> نقداً من السائق{' '}
          <strong>{row.driverName}</strong> كاملاً ومطابقاً لسجل الطلبات النقدية
          المُسوّاة في النظام بتاريخ{' '}
          <strong>{received.toLocaleDateString('en-GB')}</strong>. بهذا التوقيع
          تنتهي مسؤولية السائق عن هذا المبلغ وتنتقل إلى حسابات الفرع حتى الإيداع
          البنكي.
        </p>
      </section>

      {row.status === 'REJECTED' && row.rejectionReason ? (
        <section className="printable-sheet__section">
          <div className="printable-sheet__section-title">ملاحظة المحاسب</div>
          <p
            style={{
              fontSize: '10.5pt',
              padding: '3mm 4mm',
              background: '#fee2e2',
              color: '#991b1b',
              borderRadius: '2mm',
            }}
          >
            {row.rejectionReason}
          </p>
        </section>
      ) : null}

      <div className="printable-sheet__signatures">
        <div className="printable-sheet__signature-box">
          <div className="printable-sheet__signature-label">توقيع السائق</div>
          <div className="printable-sheet__signature-name">
            {row.driverName}
          </div>
        </div>
        <div className="printable-sheet__signature-box">
          <div className="printable-sheet__signature-label">
            توقيع مدير الفرع
          </div>
          <div className="printable-sheet__signature-name">
            {row.managerName}
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

export default CashReceiptPrintPage;
