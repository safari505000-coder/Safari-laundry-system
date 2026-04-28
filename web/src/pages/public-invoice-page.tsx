import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { ApiError, getPublicOrderInvoice, type OrderRow } from '@/lib/api';
import { BRAND } from '@/lib/brand';
import { Button } from '@/modules/shared/components/ui/button';
import { PosInvoicePrintView } from '@/components/orders/pos-invoice-print-view';

/**
 * V19.24 — Public invoice (signed JWT in URL). Customer opens the link
 * from WhatsApp, views the same receipt as staff print, and uses the
 * browser to «Save as PDF» (Print → destination PDF on mobile/desktop).
 *
 * V1.7.3 — Accepts `?autoprint=1` (or `?print=1`) to auto-trigger the
 * native print dialog once the receipt has mounted. The «تحميل الفاتورة
 * PDF» button on /payment/success uses this so the download path and
 * the WhatsApp share path both open the exact same thermal template,
 * with a single tap to "Save as PDF".
 */
export function PublicInvoicePage() {
  const { token: shareToken = '' } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const autoPrintRequested =
    searchParams.get('autoprint') === '1' || searchParams.get('print') === '1';
  const [row, setRow] = useState<OrderRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const didAutoPrintRef = useRef(false);

  useEffect(() => {
    if (!shareToken) {
      setError('رابط غير صالح.');
      return;
    }
    getPublicOrderInvoice(shareToken)
      .then(setRow)
      .catch((e) =>
        setError(
          e instanceof ApiError
            ? e.message
            : 'تعذّر تحميل الفاتورة — الرابط قد يكون منتهي الصلاحية.',
        ),
      );
  }, [shareToken]);

  // Fire the browser print dialog once, after the receipt is rendered.
  // `requestAnimationFrame` + small timeout ensures the logo image has
  // had a chance to load before the print preview snapshots the page.
  useEffect(() => {
    if (!row || !autoPrintRequested || didAutoPrintRef.current) return;
    didAutoPrintRef.current = true;
    const id = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        /* browser blocked — user can still press the toolbar button */
      }
    }, 450);
    return () => {
      window.clearTimeout(id);
    };
  }, [row, autoPrintRequested]);

  if (error) {
    return (
      <div className="min-h-svh bg-muted/40 p-6" dir="rtl">
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-foreground">{BRAND.customerAr}</h1>
          <p className="mt-3 text-sm text-destructive">{error}</p>
          <p className="mt-4 text-xs text-muted-foreground">
            للحصول على رابط جديد، يُرجى التواصل على <strong>22200299</strong>.
          </p>
        </div>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground" dir="rtl">
        جارٍ تحميل الفاتورة…
      </div>
    );
  }

  return (
    <PosInvoicePrintView
      row={row}
      toolbar={
        <div className="no-print flex w-full flex-col gap-2">
          <p className="w-full text-center text-xs text-slate-600">
            اضغط «حفظ PDF» ثم اختر «حفظ كملف PDF» أو شارك من قائمة الطباعة
            على هاتفك.
          </p>
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button
              type="button"
              className="gap-2"
              onClick={() => {
                try {
                  window.print();
                } catch {
                  /* */
                }
              }}
            >
              <Printer className="h-4 w-4" aria-hidden />
              حفظ PDF / طباعة
            </Button>
          </div>
        </div>
      }
    />
  );
}
