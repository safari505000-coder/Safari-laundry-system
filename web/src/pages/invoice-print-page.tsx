import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  apiJson,
  type OrderRow,
  createOrderInvoiceShareLink,
} from '@/lib/api';
import { PosInvoicePrintView } from '@/components/orders/pos-invoice-print-view';
import { buildInvoiceShareWhatsAppHref } from '@/modules/shared/lib/whatsapp-links';

/**
 * V19.7.6 — Printable POS invoice (staff). See `PosInvoicePrintView`.
 * V19.24 — «واتساب للعميل» mints a 7-day signed public URL + opens wa.me.
 */
export function InvoicePrintPage() {
  const { t } = useTranslation();
  const { orderId = '' } = useParams<{ orderId: string }>();
  const { token } = useAuth();
  const [row, setRow] = useState<OrderRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waBusy, setWaBusy] = useState(false);
  const autoPrintedRef = useRef(false);

  useEffect(() => {
    if (!token || !orderId) return;
    apiJson<OrderRow>(`/api/orders/${orderId}`, { token })
      .then(setRow)
      .catch((e) =>
        setError(
          e instanceof ApiError ? e.message : 'تعذّر تحميل الفاتورة',
        ),
      );
  }, [token, orderId]);

  useEffect(() => {
    if (!row || autoPrintedRef.current) return;
    autoPrintedRef.current = true;
    const id = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        /* */
      }
    }, 350);
    return () => window.clearTimeout(id);
  }, [row]);

  async function handleWhatsApp() {
    if (!token || !row) return;
    const phone = row.customer.phone?.trim() || row.customer.phone2?.trim();
    if (!phone) {
      toast.error(t('invoicePrint.whatsappNoPhone'));
      return;
    }
    setWaBusy(true);
    try {
      const { shareUrl } = await createOrderInvoiceShareLink(token, row.id);
      const href = buildInvoiceShareWhatsAppHref(phone, shareUrl, {
        customerName: row.customer.displayName,
        orderLabel:
          row.invoiceNumber?.trim() || row.serialNumber?.trim() || row.id.slice(0, 8),
      });
      if (!href) {
        toast.error(t('invoicePrint.whatsappNoPhone'));
        return;
      }
      window.open(href, '_blank', 'noopener,noreferrer');
      toast.success(t('invoicePrint.whatsappOpened'));
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setWaBusy(false);
    }
  }

  if (error) {
    return (
      <div
        style={{ padding: 32, textAlign: 'center', color: '#e11d48' }}
        dir="rtl"
      >
        {error}
      </div>
    );
  }
  if (!row) {
    return (
      <div
        style={{ padding: 32, textAlign: 'center', color: '#64748b' }}
        dir="rtl"
      >
        جارٍ التحميل…
      </div>
    );
  }

  return (
    <PosInvoicePrintView
      row={row}
      toolbar={
        <>
          <button
            type="button"
            className="invoice-print-btn primary"
            onClick={() => window.print()}
          >
            {t('invoicePrint.print')}
          </button>
          <button
            type="button"
            className="invoice-print-btn whatsapp"
            onClick={() => void handleWhatsApp()}
            disabled={waBusy}
            title={t('invoicePrint.whatsappHint')}
          >
            <MessageCircle className="me-1 inline h-4 w-4" aria-hidden />
            {t('invoicePrint.whatsapp')}
          </button>
          <button
            type="button"
            className="invoice-print-btn"
            onClick={() => window.close()}
          >
            {t('invoicePrint.close')}
          </button>
        </>
      }
    />
  );
}

export default InvoicePrintPage;
