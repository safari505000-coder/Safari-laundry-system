import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { ApiError, apiJson, type OrderRow } from '@/lib/api';
import { BRAND } from '@/lib/brand';
import { OrderIdBarcode } from '@/modules/shared/components/orders/order-id-barcode';
import { TermsQr } from '@/components/common/terms-qr';

/**
 * V19.7.6 — Printable POS invoice. Mirrors the EXACT 80mm thermal
 * receipt that the driver / branch manager prints from the POS so
 * auditors, customers, and Call Center all see one canonical document
 * number and layout. The receipt markup intentionally reuses the
 * `#pos-receipt-print` + `pos-receipt-wrap` / `pos-receipt-*` class
 * names defined in `src/index.css @media print`, so the browser print
 * dialog emits a byte-for-byte identical roll.
 *
 * Read-only: it fetches `/api/orders/:orderId` (backend RBAC already
 * restricts visibility to OWNER / GM / MANAGER / CALL_CENTER /
 * ACCOUNTANT / SUPERVISOR / VIEWER + the assigned driver) and opens the
 * browser print dialog automatically once the data lands. An explicit
 * "Print" button stays visible so the operator can re-print without a
 * full page refresh.
 */

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'نقداً / Cash',
  KNET: 'كي نت / KNET',
  ONLINE: 'أونلاين / Online',
  PAYMENT_LINK: 'رابط دفع / Payment Link',
  SUBSCRIPTION_WALLET: 'محفظة الاشتراك / Wallet',
  DEBT_ON_ACCOUNT: 'على الحساب / Debt',
};

const SERVICE_TYPE_LABEL: Record<string, string> = {
  NORMAL: 'NORMAL',
  URGENT: 'URGENT',
  VIP: 'VIP',
  EXPRESS: 'EXPRESS',
};

function formatKwdParts(value: number): { dinar: string; fils: string } {
  const fixed = Number.isFinite(value) ? value.toFixed(3) : '0.000';
  const [dinar, fils = '000'] = fixed.split('.');
  return { dinar, fils };
}

export function InvoicePrintPage() {
  const { orderId = '' } = useParams<{ orderId: string }>();
  const { token } = useAuth();
  const [row, setRow] = useState<OrderRow | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  // Auto-trigger the browser print dialog once the data lands. We guard
  // with `autoPrintedRef` so React Strict-Mode double-invocation in dev
  // doesn't fire `window.print()` twice on the operator's screen.
  useEffect(() => {
    if (!row || autoPrintedRef.current) return;
    autoPrintedRef.current = true;
    // `requestAnimationFrame` lets the receipt DOM settle (fonts, images,
    // barcode SVG) before the browser snapshots the page for printing.
    const id = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        /* Browser blocked auto-print; the on-screen button still works. */
      }
    }, 350);
    return () => window.clearTimeout(id);
  }, [row]);

  const lines = row?.lineItems ?? [];

  const derived = useMemo(() => {
    if (!row) {
      return { subtotal: 0, deliveryFee: 0, total: 0 };
    }
    // Delivery fee is materialised as a dedicated line item whose label
    // starts with "DELIVERY_" (see orders.service — `mapPosCheckoutLineItems`).
    // Split it out so the receipt shows "subtotal / delivery / total" the
    // same way the driver's POS receipt does. If no such line exists the
    // delivery fee is 0 and the subtotal equals the grand total.
    let delivery = 0;
    let subtotal = 0;
    for (const li of row.lineItems) {
      const qty = Number(li.quantity) || 0;
      const unit = Number(li.unitPrice) || 0;
      const sub = qty * unit;
      const label = (li.label ?? '').toUpperCase();
      if (label.startsWith('DELIVERY')) {
        delivery += sub;
      } else {
        subtotal += sub;
      }
    }
    const total = Number(row.totalPrice) || subtotal + delivery;
    return { subtotal, deliveryFee: delivery, total };
  }, [row]);

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

  const docNumber =
    row.serialNumber?.trim() ||
    row.invoiceNumber?.trim() ||
    row.id.slice(0, 8).toUpperCase();

  const createdAt = row.completedAt ?? row.createdAt;
  const driverLabel = row.driver
    ? `${row.driver.employeeId ?? row.driver.username} / ${row.driver.fullName}`
    : '—';
  const paymentLabel = row.posPaymentMethod
    ? (PAYMENT_METHOD_LABEL[row.posPaymentMethod] ?? row.posPaymentMethod)
    : null;
  const serviceLabel =
    SERVICE_TYPE_LABEL[row.serviceType] ?? row.serviceType ?? 'NORMAL';

  const notesLines = (row.notes ?? '').trim();

  return (
    <div className="invoice-print-stage" dir="rtl">
      {/*
        V19.7.6 — screen-only affordances. The receipt itself is rendered
        inside `#pos-receipt-print` below so the existing
        `src/index.css @media print` rules apply verbatim at print time.
        These toolbar buttons are marked `.no-print` so they disappear
        from the thermal roll.
      */}
      <div className="invoice-print-toolbar no-print">
        <button
          type="button"
          className="invoice-print-btn primary"
          onClick={() => window.print()}
        >
          طباعة / Print
        </button>
        <button
          type="button"
          className="invoice-print-btn"
          onClick={() => window.close()}
        >
          إغلاق / Close
        </button>
      </div>

      <section
        id="pos-receipt-print"
        className="invoice-print-surface"
        aria-label="POS receipt"
      >
        <div className="pos-receipt-wrap pos-receipt-sheet" dir="rtl">
          <img
            src="/logo.png"
            alt={BRAND.customerAr}
            className="pos-receipt-logo"
          />
          <h2>{BRAND.customerAr}</h2>
          <p className="pos-receipt-sub">{BRAND.customerEn}</p>
          <p className="pos-receipt-sub">Farwaniya, 00</p>
          <p className="pos-receipt-sub">
            Shop Tel: 24899399 - Call Center: 22200299
          </p>
          <div className="pos-receipt-meta-grid">
            <p>
              <strong>INV#:</strong> {docNumber}
            </p>
            <p>
              <strong>Employee:</strong> {driverLabel}
            </p>
            <p>
              <strong>Date:</strong>{' '}
              {new Date(createdAt).toLocaleString('en-GB')}
            </p>
          </div>
          {row.cashStatus !== 'PAID_TO_DRIVER' && row.status !== 'CANCELED' ?
            <p
              className="pos-payment-pending"
              dir="auto"
            >
              دفع غير مكتمل — الفاتورة لم تُسدَّد بعد
            </p>
          : null}
          {row.status === 'CANCELED' ?
            <p
              className="pos-payment-canceled"
              dir="auto"
            >
              فاتورة ملغاة / CANCELED
            </p>
          : null}
          <div className="pos-customer-box">
            <div className="pos-customer-row">
              <span>
                <strong>Name:</strong> {row.customer.displayName ?? '-'}
              </span>
              <span>
                <strong>Mobile:</strong> {row.customer.phone ?? '-'}
              </span>
            </div>
            <div className="pos-customer-address">
              <strong>Address:</strong> {row.customer.address ?? '-'}
            </div>
          </div>
          <table className="pos-receipt-table">
            <thead>
              <tr>
                <th>الأصناف</th>
                <th>Type</th>
                <th className="text-end">K.D</th>
                <th className="text-end">F</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ?
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center' }}>
                    — لا توجد أصناف مفصّلة —
                  </td>
                </tr>
              : lines.map((line, idx) => {
                  const qty = Number(line.quantity) || 0;
                  const unit = Number(line.unitPrice) || 0;
                  const sub = qty * unit;
                  const parts = formatKwdParts(sub);
                  return (
                    <tr key={`${line.id}-${idx}`}>
                      <td className="pos-receipt-desc">
                        <div>{line.label ?? '—'}</div>
                        <div className="pos-receipt-qty">{qty} x</div>
                        {line.starchOption ?
                          <div className="pos-receipt-specs">
                            <div>
                              <strong>نشا / Starch:</strong>{' '}
                              {line.starchOption}
                            </div>
                          </div>
                        : null}
                      </td>
                      <td>{serviceLabel}</td>
                      <td className="text-end">{parts.dinar}</td>
                      <td className="text-end">{parts.fils}</td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
          <div className="pos-receipt-totals">
            <div>
              <span>Sub Total</span>
              <span>
                {derived.subtotal.toFixed(3)} د.ك
              </span>
            </div>
            {derived.deliveryFee > 0 ?
              <div>
                <span>Delivery</span>
                <span>{derived.deliveryFee.toFixed(3)} د.ك</span>
              </div>
            : null}
            <div className="net">
              <span>Net Total</span>
              <span>{derived.total.toFixed(3)} د.ك</span>
            </div>
            {paymentLabel ?
              <div className="pos-payment-label">
                <strong>الدفع / Payment:</strong> {paymentLabel}
              </div>
            : null}
          </div>
          {notesLines ?
            <div className="pos-receipt-notes">
              <p><strong>ملاحظات:</strong></p>
              <p style={{ whiteSpace: 'pre-wrap' }}>{notesLines}</p>
            </div>
          : null}
          {row.id ?
            <div className="pos-receipt-barcode">
              <OrderIdBarcode orderId={row.id} variant="receipt" />
              <p className="pos-receipt-barcode-caption">
                امسح الباركود للتحقق من الفاتورة
              </p>
            </div>
          : null}
          <div
            style={{
              marginTop: '2mm',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1mm',
            }}
          >
            <TermsQr size={78} />
            <p style={{ fontSize: '8px', color: '#555' }}>
              شروط وأحكام الخدمة — امسح الكود
            </p>
          </div>
          <div className="pos-receipt-terms">
            <p>الشروط والأحكام:</p>
            <p>
              يبدأ تسليم الطلبات المستعجلة خلال ساعات العمل وفق سياسة الفرع. يرجى
              مراجعة الفاتورة خلال 24 ساعة من الاستلام. المتجر غير مسؤول عن
              المقتنيات الشخصية داخل الملابس، ولا يلتزم بالتخزين بعد 30 يوماً.
              تعويض القطع التالفة يخضع لسياسة الشركة وبحد أقصى 25% مع إبراز
              الفاتورة الأصلية.
            </p>
          </div>
        </div>
      </section>

      {/*
        V19.7.6 — screen preview styling. `@media print` rules in
        `src/index.css` already render the receipt at 80mm with the
        correct typography; these rules kick in ONLY on screen so the
        operator sees a paper-like card instead of the raw, tiny-print
        layout the thermal roll expects.
      */}
      <style>{`
        .invoice-print-stage {
          min-height: 100vh;
          padding: 24px 12px 48px;
          background: #f1f5f9;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          font-family: 'Cairo', 'Almarai', system-ui, sans-serif;
        }
        .invoice-print-toolbar {
          display: flex;
          gap: 8px;
          width: min(80mm, 100%);
          justify-content: flex-end;
        }
        .invoice-print-btn {
          appearance: none;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #0f172a;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 120ms ease;
        }
        .invoice-print-btn:hover {
          background: #f8fafc;
        }
        .invoice-print-btn.primary {
          background: #0f172a;
          color: #ffffff;
          border-color: #0f172a;
        }
        .invoice-print-btn.primary:hover {
          background: #1e293b;
        }

        @media print {
          .invoice-print-stage {
            padding: 0;
            background: #ffffff;
          }
          .no-print { display: none !important; }
        }

        /*
          Screen-only receipt card. We scope every selector behind
          \`@media (min-width: 0px)\` so the real \`@media print\` rules in
          src/index.css keep their specificity on the thermal roll.
        */
        @media screen {
          .invoice-print-surface {
            width: 80mm;
            background: #ffffff;
            color: #0f172a;
            border-radius: 6px;
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
            padding: 4mm;
            display: block;
            position: static;
            z-index: auto;
          }
          .invoice-print-surface .pos-receipt-wrap {
            width: 72mm;
            margin: 0 auto;
            font-size: 10.5px;
            line-height: 1.32;
            font-family: 'Cairo', 'Almarai', sans-serif;
            text-align: right;
            color: #0f172a;
          }
          .invoice-print-surface .pos-receipt-logo {
            display: block;
            width: 35mm;
            height: auto;
            max-height: 80px;
            margin: 0 auto 1.4mm;
            object-fit: contain;
          }
          .invoice-print-surface h2 {
            margin: 0;
            text-align: center;
            font-size: 13px;
            font-weight: 700;
          }
          .invoice-print-surface .pos-receipt-sub {
            margin: 0;
            text-align: center;
            font-size: 9.5px;
          }
          .invoice-print-surface .pos-receipt-meta-grid {
            margin-top: 1.5mm;
            border-top: 1px dashed #0f172a;
            border-bottom: 1px dashed #0f172a;
            padding: 1.2mm 0;
          }
          .invoice-print-surface .pos-receipt-meta-grid p {
            margin: 0 0 0.8mm;
          }
          .invoice-print-surface .pos-payment-pending {
            margin: 1.6mm 0;
            border: 1px solid #f59e0b;
            background: #fffbeb;
            color: #92400e;
            padding: 1mm 2mm;
            text-align: center;
            font-size: 10px;
            font-weight: 600;
            border-radius: 2px;
          }
          .invoice-print-surface .pos-payment-canceled {
            margin: 1.6mm 0;
            border: 1px solid #ef4444;
            background: #fef2f2;
            color: #991b1b;
            padding: 1mm 2mm;
            text-align: center;
            font-size: 10px;
            font-weight: 700;
            border-radius: 2px;
          }
          .invoice-print-surface .pos-customer-box {
            border: 1px solid #0f172a;
            padding: 1.5mm;
            margin-top: 1.5mm;
          }
          .invoice-print-surface .pos-customer-row {
            display: flex;
            justify-content: space-between;
            gap: 2mm;
            margin-bottom: 0.7mm;
            flex-wrap: wrap;
          }
          .invoice-print-surface .pos-customer-address {
            border-top: 1px dashed #0f172a;
            padding-top: 0.8mm;
            margin-top: 0.8mm;
            word-break: break-word;
          }
          .invoice-print-surface .pos-receipt-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 1.6mm;
            table-layout: fixed;
          }
          .invoice-print-surface .pos-receipt-table th {
            border-bottom: 1px solid #0f172a;
            padding-bottom: 0.8mm;
            text-align: start;
            font-size: 9.5px;
          }
          .invoice-print-surface .pos-receipt-table td {
            padding: 1mm 0;
            vertical-align: top;
            border-bottom: 1px dashed #0f172a;
            font-size: 9.8px;
          }
          .invoice-print-surface .pos-receipt-table th:nth-child(1),
          .invoice-print-surface .pos-receipt-table td:nth-child(1) { width: 42%; }
          .invoice-print-surface .pos-receipt-table th:nth-child(2),
          .invoice-print-surface .pos-receipt-table td:nth-child(2) { width: 24%; text-align: center; }
          .invoice-print-surface .pos-receipt-table th:nth-child(3),
          .invoice-print-surface .pos-receipt-table td:nth-child(3) { width: 17%; text-align: end; }
          .invoice-print-surface .pos-receipt-table th:nth-child(4),
          .invoice-print-surface .pos-receipt-table td:nth-child(4) { width: 17%; text-align: end; }
          .invoice-print-surface .text-end { text-align: end; }
          .invoice-print-surface .pos-receipt-qty {
            font-size: 8.8px;
            opacity: 0.85;
          }
          .invoice-print-surface .pos-receipt-specs {
            margin-top: 0.8mm;
            font-size: 8.4px;
            line-height: 1.3;
          }
          .invoice-print-surface .pos-receipt-totals {
            margin-top: 1.5mm;
            padding-top: 1.1mm;
            border-top: 1px dashed #0f172a;
          }
          .invoice-print-surface .pos-receipt-totals > div {
            display: flex;
            justify-content: space-between;
            margin-bottom: 0.7mm;
          }
          .invoice-print-surface .pos-receipt-totals .net {
            font-weight: 700;
            font-size: 11px;
          }
          .invoice-print-surface .pos-payment-label {
            margin-top: 0.5mm;
            font-size: 9px;
            color: #475569;
          }
          .invoice-print-surface .pos-receipt-terms {
            margin-top: 1.4mm;
            padding-top: 1.1mm;
            border-top: 1px dashed #0f172a;
            font-size: 8px;
            line-height: 1.4;
          }
          .invoice-print-surface .pos-receipt-terms p {
            margin: 0 0 0.5mm;
          }
          .invoice-print-surface .pos-receipt-notes {
            margin-top: 1.2mm;
            padding-top: 1.1mm;
            border-top: 1px dashed #0f172a;
            font-size: 8.6px;
            line-height: 1.35;
          }
          .invoice-print-surface .pos-receipt-notes p {
            margin: 0 0 0.5mm;
          }
          .invoice-print-surface .pos-receipt-barcode {
            margin-top: 2mm;
            padding-top: 1.5mm;
            border-top: 1px dashed #0f172a;
            text-align: center;
          }
          .invoice-print-surface .pos-receipt-barcode-caption {
            margin: 0.8mm 0 0;
            font-size: 8px;
            text-align: center;
          }
          .invoice-print-surface .pos-receipt-barcode svg {
            max-width: 100%;
            height: auto;
          }
        }
      `}</style>
    </div>
  );
}

export default InvoicePrintPage;
