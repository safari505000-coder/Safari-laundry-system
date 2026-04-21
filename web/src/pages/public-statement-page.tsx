import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ApiError,
  getPublicCustomerStatement,
  type CustomerLedgerResponse,
} from '@/lib/api';
import { StatementSheet } from '@/pages/statement-print-page';
import { BRAND } from '@/lib/brand';
import { Printer } from 'lucide-react';
import { Button } from '@/modules/shared/components/ui/button';
import './statement-print.css';

/**
 * V19.8.9 — Public customer statement view.
 *
 * Rendered when the customer taps the link the Call Center sent over
 * WhatsApp. The link carries a signed JWT in the path (`:token`) that
 * embeds the customer ID plus optional date window; the backend
 * re-scopes the request to that customer so the URL can be opened
 * from any device without login and cannot be swapped to peek at
 * other customers.
 *
 * UX:
 *   - Same A4 statement the agent prints, rendered via `StatementSheet`.
 *   - Prominent "حفظ PDF" toolbar so the customer gets the actual PDF
 *     file they expected when the message said "PDF" — `window.print()`
 *     lets them pick "Save as PDF" from the browser dialog (Chrome,
 *     iOS Safari, Android Chrome all support this natively).
 *   - No auto-print here: on a phone, a spontaneous print dialog is
 *     jarring; the customer should read the page first, then tap the
 *     save button.
 */
export function PublicStatementPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [data, setData] = useState<CustomerLedgerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('الرابط غير صالح.');
      return;
    }
    getPublicCustomerStatement(token)
      .then(setData)
      .catch((e) =>
        setError(
          e instanceof ApiError
            ? e.message
            : 'تعذّر تحميل الكشف — الرابط قد يكون منتهي الصلاحية.',
        ),
      );
  }, [token]);

  if (error) {
    return (
      <div className="public-statement-error" dir="rtl">
        <div>
          <h1>{BRAND.customerAr}</h1>
          <p>{error}</p>
          <p className="public-statement-error__hint">
            للحصول على رابط جديد، يُرجى التواصل مع مركز خدمة العملاء على
            <strong> 22200299</strong>.
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="public-statement-loading" dir="rtl">
        جارٍ تحميل الكشف…
      </div>
    );
  }

  return (
    <div dir="rtl" className="public-statement-shell">
      <div className="public-statement-hint no-print">
        <Printer className="h-5 w-5" aria-hidden="true" />
        <div>
          <strong>لحفظ الكشف كملف PDF على جهازك:</strong>{' '}
          اضغط زر <em>الطباعة</em> بالأعلى واختر
          «Save as PDF / حفظ بصيغة PDF» من قائمة الطابعة.
        </div>
      </div>
      <StatementSheet
        data={data}
        rangeLabel="كشف الحساب الكامل"
        onBack={() => {
          // Public link opens on the customer's own phone / browser;
          // `navigate(-1)` will usually land on their previous tab,
          // but if the link was opened from WhatsApp in a fresh tab
          // we prefer closing the tab instead of breaking their
          // browsing history.
          if (window.history.length > 1) window.history.back();
          else window.close();
        }}
      />
      <div className="public-statement-download no-print">
        <Button
          type="button"
          onClick={() => {
            try {
              window.print();
            } catch {
              /* ignored — user can still use Ctrl/Cmd+P */
            }
          }}
        >
          <Printer className="h-4 w-4" />
          <span className="ms-2">حفظ بصيغة PDF</span>
        </Button>
      </div>
    </div>
  );
}

export default PublicStatementPage;
