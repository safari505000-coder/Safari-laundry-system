import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  getManagerExpenseVoucher,
  type ManagerExpenseVoucher,
} from '@/lib/api';
import { PrintableSheet } from '@/modules/shared/print';

/**
 * V19.22.5 — Branch-expense voucher (سند مصروف معتمد).
 *
 * Printed by a Branch Manager from the "My Documents" island. The
 * underlying `BranchExpense` row is already `APPROVED` by the time a
 * voucher URL exists; the print sheet simply formalises the approval
 * on paper so the branch can file it alongside the original receipt
 * photo.
 */

function formatKwd3(v: string | number): string {
  const n = typeof v === 'number' ? v : Number.parseFloat(v || '0');
  if (!Number.isFinite(n)) return `${String(v)} د.ك`;
  return `${n.toLocaleString('en-GB', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} د.ك`;
}

const CATEGORY_AR: Record<string, string> = {
  FUEL: 'وقود',
  MAINTENANCE: 'صيانة',
  SUPPLIES: 'مستلزمات',
  CLEANING: 'نظافة',
  UTILITIES: 'خدمات',
  RENT: 'إيجار',
  FOOD: 'طعام',
  TRANSPORTATION: 'مواصلات',
  OTHER: 'أخرى',
};

const METHOD_AR: Record<string, string> = {
  CASH: 'كاش',
  PREPAID_CARD: 'بطاقة مسبقة الدفع',
  BANK_TRANSFER: 'حوالة بنكية',
  COMPANY_CARD: 'بطاقة الشركة',
  KNET: 'كي نت',
};

export function ExpenseVoucherPrintPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [row, setRow] = useState<ManagerExpenseVoucher | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    getManagerExpenseVoucher(token, id)
      .then(setRow)
      .catch((e) =>
        setError(
          e instanceof ApiError ? e.message : 'تعذّر تحميل سند المصروف',
        ),
      );
  }, [token, id]);

  if (error) {
    return <div className="p-8 text-center text-rose-400">{error}</div>;
  }
  if (!row) {
    return <div className="p-8 text-center text-slate-400">جارٍ التحميل…</div>;
  }

  const docNumber = `EV-${row.id.slice(0, 8).toUpperCase()}`;
  const expenseDate = new Date(row.expenseDate);
  const approvedAt = new Date(row.approvedAt);

  return (
    <PrintableSheet
      docType="EXPENSE_VOUCHER"
      docId={row.id}
      docNumber={docNumber}
      issuedAtIso={row.approvedAt}
      title="سند مصروف معتمد"
      subtitle={`الفرع: ${row.branch?.name ?? '—'} — الفئة: ${CATEGORY_AR[row.category] ?? row.category}`}
      status={{ label: 'معتمد', kind: 'approved' }}
    >
      <section className="printable-sheet__section">
        <div className="printable-sheet__section-title">بيانات المستند</div>
        <div className="printable-sheet__grid-2">
          <Field label="رقم المستند" value={docNumber} mono />
          <Field label="الفرع" value={row.branch?.name ?? '—'} />
          <Field
            label="تاريخ المصروف"
            value={expenseDate.toLocaleDateString('en-GB')}
          />
          <Field
            label="تاريخ الاعتماد"
            value={approvedAt.toLocaleDateString('en-GB')}
          />
        </div>
      </section>

      <section className="printable-sheet__section">
        <div className="printable-sheet__section-title">تفاصيل المصروف</div>
        <div className="printable-sheet__grid-2">
          <Field label="العنوان" value={row.title} />
          <Field
            label="الفئة"
            value={CATEGORY_AR[row.category] ?? row.category}
          />
          <Field
            label="طريقة الدفع"
            value={METHOD_AR[row.expenseMethod] ?? row.expenseMethod}
          />
          <Field label="المبلغ" value={formatKwd3(row.amountKd)} mono />
        </div>
      </section>

      {row.note ? (
        <section className="printable-sheet__section">
          <div className="printable-sheet__section-title">ملاحظات</div>
          <p
            style={{
              fontSize: '10.5pt',
              lineHeight: 1.8,
              padding: '3mm 4mm',
              background: '#fffbeb',
              borderInlineStart: '3px solid #f59e0b',
              borderRadius: '2mm',
            }}
          >
            {row.note}
          </p>
        </section>
      ) : null}

      <section className="printable-sheet__section">
        <div className="printable-sheet__section-title">إقرار المحاسب</div>
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
          تمّت مراجعة هذا المصروف من قِبَل قسم المحاسبة وتمّ اعتماده بتاريخ{' '}
          <strong>{approvedAt.toLocaleDateString('en-GB')}</strong>. المبلغ{' '}
          <strong>{formatKwd3(row.amountKd)}</strong> يُقيَّد على حساب الفرع{' '}
          <strong>{row.branch?.name ?? '—'}</strong> ضمن فئة{' '}
          <strong>{CATEGORY_AR[row.category] ?? row.category}</strong>.
        </p>
      </section>

      <div className="printable-sheet__signatures">
        <div className="printable-sheet__signature-box">
          <div className="printable-sheet__signature-label">
            توقيع مُقدّم المصروف
          </div>
          <div className="printable-sheet__signature-name">
            {row.recordedBy.fullName}
          </div>
        </div>
        <div className="printable-sheet__signature-box">
          <div className="printable-sheet__signature-label">
            توقيع المحاسب
          </div>
          <div className="printable-sheet__signature-name">—</div>
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

export default ExpenseVoucherPrintPage;
