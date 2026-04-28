import { useMemo, type ReactNode } from 'react';
import type { OrderRow } from '@/lib/api';
import { BRAND } from '@/lib/brand';
import { OrderIdBarcode } from '@/modules/shared/components/orders/order-id-barcode';
import { TermsQr } from '@/components/common/terms-qr';

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

/**
 * Shared 80mm POS receipt body — used by staff `/invoices/:id/print` and
 * public `/public/invoice/:token` (WhatsApp share link).
 */
export function PosInvoicePrintView({
  row,
  toolbar,
}: {
  row: OrderRow;
  toolbar?: ReactNode;
}) {
  const lines = row.lineItems ?? [];

  const derived = useMemo(() => {
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
      {toolbar ?
        <div className="invoice-print-toolbar no-print">{toolbar}</div>
      : null}

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
          {/* V1.7.3 — Unified payment-status stamp. The three possible
              states a settled order can carry (PAID_TO_DRIVER cash trail,
              PAID_ONLINE gateway/link settlement, HANDED_OVER_TO_OFFICE
              manager handover) all suppress the "unpaid" warning. When
              the gateway just finalized an online payment we stamp a
              green "تم الدفع أونلاين ✅" badge so the customer's saved
              PDF shows the correct status the moment they download it
              from the /payment/success page. */}
          {row.status === 'CANCELED' ? (
            <p className="pos-payment-canceled" dir="auto">
              فاتورة ملغاة / CANCELED
            </p>
          ) : row.cashStatus === 'UNPAID' ? (
            <p className="pos-payment-pending" dir="auto">
              دفع غير مكتمل — الفاتورة لم تُسدَّد بعد
            </p>
          ) : row.cashStatus === 'PAID_ONLINE' ? (
            <p className="pos-payment-online" dir="auto">
              تم الدفع أونلاين ✅
            </p>
          ) : null}
          <div className="pos-customer-box">
            <div className="pos-customer-row">
              <span>
                <strong>Name:</strong> {row.customer.displayName ?? '-'}
              </span>
              <span>
                <strong>Mobile:</strong> {row.customer.phone ?? '-'}
              </span>
            </div>
            {(() => {
              const debtRaw = row.customer.wallet?.debt ?? '0';
              const debt = Number.parseFloat(debtRaw);
              if (!Number.isFinite(debt) || debt <= 0) return null;
              return (
                <div className="pos-customer-row">
                  <span className="pos-customer-debt">
                    <strong>المديونية / Debt:</strong> {debt.toFixed(3)} د.ك
                  </span>
                </div>
              );
            })()}
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
                              <strong>نشا / Starch:</strong> {line.starchOption}
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
              <span>{derived.subtotal.toFixed(3)} د.ك</span>
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
              <p>
                <strong>ملاحظات:</strong>
              </p>
              <p style={{ whiteSpace: 'pre-wrap' }}>{notesLines}</p>
            </div>
          : null}
          {row.id ?
            <div className="pos-receipt-barcode">
              <OrderIdBarcode
                orderId={row.id}
                variant="receipt"
                displayLabel={docNumber}
              />
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
            <TermsQr size={78} orderId={row.id} />
            <p style={{ fontSize: '8px', color: '#555' }}>
              امسح الكود لمشاركة تقييمك + مراجعة الشروط
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
          flex-wrap: wrap;
          gap: 8px;
          width: min(80mm, 100%);
          justify-content: flex-end;
          align-items: center;
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
        .invoice-print-btn.whatsapp {
          background: #25d366;
          color: #ffffff;
          border-color: #128c7e;
        }
        .invoice-print-btn.whatsapp:hover {
          background: #1ebe5a;
        }

        @media print {
          .invoice-print-stage {
            padding: 0;
            background: #ffffff;
          }
          .no-print { display: none !important; }
        }

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
          /* V1.7.3 — green "paid online" stamp shown when the gateway
             settled the order. Same visual weight as the pending banner
             but in the emerald palette so it reads as "confirmed". */
          .invoice-print-surface .pos-payment-online {
            margin: 1.6mm 0;
            border: 1px solid #10b981;
            background: #ecfdf5;
            color: #065f46;
            padding: 1mm 2mm;
            text-align: center;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.02em;
            border-radius: 2px;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
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
          .invoice-print-surface .pos-customer-debt {
            display: inline-block;
            padding: 0 1mm;
            border: 1px solid #c00;
            color: #c00;
            font-weight: 700;
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
