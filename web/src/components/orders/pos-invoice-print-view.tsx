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

  /** إجمالي مديونية المحفظة يُعرض هنا فقط عندما تكون *هذه* الفاتورة ذات ذمّة مفتوحة — لا على الفواتير المسدّدة بينما للعميل دين من فواتير أخرى. */
  // allow-legacy-debt-reader (V20.6 Phase 2: cashStatus is a server-canonical render flag set when the invoice was issued; not a UI-side debt computation)
  const invoiceShowsWalletDebtReminder =
    row.status !== 'CANCELED' &&
    (row.cashStatus === 'UNPAID' || row.posPaymentMethod === 'DEBT_ON_ACCOUNT');

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
            src={BRAND.brandMarkPath}
            alt={BRAND.customerAr}
            className="pos-receipt-logo"
          />
          {/* V1.7.5 — Branded header. The canonical customer name
              (مجموعة مصابغ سفاري السريعة) sits on top with a gold rule
              under it, and the bilingual identity block below carries
              only the data we actually know is correct — the hard-coded
              «Farwaniya, 00» placeholder was removed because it rendered
              as nonsense on non-Farwaniya invoices. Branch + phone lines
              use proper Arabic glyphs (not the previous ASCII dashes
              which broke under some RTL browsers — those were the
              «طلاسم» the Owner flagged). */}
          <h2 className="pos-brand-ar">{BRAND.customerAr}</h2>
          <span className="pos-brand-rule" aria-hidden />
          <p className="pos-brand-en">{BRAND.customerEn}</p>
          <p className="pos-receipt-sub">
            <span dir="ltr">
              <strong>هاتف الفرع:</strong> 24899399
            </span>
            <span className="pos-brand-dot" aria-hidden>
              •
            </span>
            <span dir="ltr">
              <strong>مركز الاتصال:</strong> 22200299
            </span>
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
          ) : // allow-legacy-debt-reader (V20.6 Phase 2: server-canonical settlement flag)
          row.cashStatus === 'UNPAID' ? (
            <p className="pos-payment-pending" dir="auto">
              دفع غير مكتمل — الفاتورة لم تُسدَّد بعد
            </p>
          ) : row.posPaymentMethod === 'DEBT_ON_ACCOUNT' ? (
            // V1.7.4 — DEBT_ON_ACCOUNT invoices are workflow-completed
            // but the customer still owes the money. The paper trail
            // must read "مديونية" so the Call-Center agent, the driver,
            // and the customer never mistake it for a settled cash/
            // KNET receipt. Once CC marks it paid, `posPaymentMethod`
            // flips to CASH/KNET/etc. and this banner disappears.
            <p className="pos-payment-pending" dir="auto">
              مديونية على الحساب — لم تُسدَّد بعد
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
            {invoiceShowsWalletDebtReminder ?
              (() => {
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
              })()
            : null}
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
          {/* V1.7.5 — "سياسة التقييم والشروط" block. The Owner's
              directive was to bring the evaluation policy to the front,
              so this replaces the former single-paragraph legalese with
              a numbered policy card. Printed glyphs stay Cairo (no
              ASCII bullets that break on thermal printers) and the
              block keeps its monochrome 8pt rendering so the tape comes
              out crisp. */}
          <div className="pos-receipt-terms">
            <p className="pos-terms-heading">
              سياسة التقييم والشروط
              <span className="pos-terms-heading-en" dir="ltr">
                / Evaluation Policy &amp; Terms
              </span>
            </p>
            <ol className="pos-terms-list">
              <li>
                فترة التقييم: يرجى فحص القطع المستلمة خلال ٢٤ ساعة — بعدها
                تُعتبر الفاتورة مُقرّة.
              </li>
              <li>
                تعويض القطع التالفة يخضع لسياسة الشركة بحدٍّ أقصى ٢٥٪ من
                قيمة القطعة، وبإبراز الفاتورة الأصلية.
              </li>
              <li>
                المصبغة غير مسؤولة عن المقتنيات الشخصية المتروكة داخل
                الملابس (مجوهرات، نقود، بطاقات).
              </li>
              <li>
                لا تلتزم المصبغة بتخزين الطلبات بعد مرور ٣٠ يوماً من
                تاريخ الفاتورة.
              </li>
              <li>
                الطلبات المستعجلة تخضع لجدول ساعات العمل الرسمي للفرع —
                يُرجى التنسيق مسبقاً.
              </li>
              <li>
                نشكركم لاختياركم مجموعة مصابغ سفاري — خدمة بجودة ملكية
                وعناية بكل قطعة.
              </li>
            </ol>
          </div>
        </div>
      </section>

      <style>{`
        .invoice-print-stage {
          position: relative;
          min-height: 100vh;
          padding: 28px 12px 56px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          font-family: 'Cairo', 'Almarai', system-ui, -apple-system, 'Segoe UI', sans-serif;
          font-feature-settings: "kern" 1, "liga" 1, "rlig" 1, "calt" 1;
          text-rendering: optimizeLegibility;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          background: #ffffff;
          overflow: hidden;
          isolation: isolate;
        }
        .invoice-print-toolbar {
          position: relative;
          z-index: 1;
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
          .invoice-print-backdrop { display: none !important; }
          .no-print { display: none !important; }
        }

        @media screen {
          .invoice-print-surface {
            width: 80mm;
            background: #ffffff;
            color: #0f172a;
            border-radius: 10px;
            box-shadow:
              0 24px 60px -18px rgba(14, 116, 144, 0.35),
              0 10px 22px -12px rgba(2, 132, 199, 0.28),
              0 0 0 1px rgba(191, 219, 254, 0.6) inset;
            padding: 4mm;
            display: block;
            position: relative;
            z-index: 1;
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
          /* V1.7.5 — Branded header refinements. A thin gold hairline
             rule under the Arabic trade-name and a bullet separator
             inside the phone line turn the top of the receipt into a
             proper brand plate. Works on the thermal printer too —
             the gold degrades to black on monochrome paper, the dot
             prints as the standard UTF-8 bullet (no ASCII fallback). */
          .invoice-print-surface .pos-brand-ar {
            font-size: 14px;
            letter-spacing: 0.01em;
          }
          .invoice-print-surface .pos-brand-rule {
            display: block;
            width: 26mm;
            height: 2px;
            margin: 1mm auto 1.4mm;
            background: linear-gradient(90deg,
              transparent 0%,
              #c6a14a 20%,
              #f0d27a 50%,
              #c6a14a 80%,
              transparent 100%);
            border-radius: 2px;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .invoice-print-surface .pos-brand-en {
            margin: 0 0 1.1mm;
            text-align: center;
            font-size: 9.2px;
            letter-spacing: 0.02em;
            color: #334155;
          }
          .invoice-print-surface .pos-brand-dot {
            display: inline-block;
            margin: 0 1mm;
            color: #0ea5e9;
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
            line-height: 1.5;
          }
          .invoice-print-surface .pos-receipt-terms p {
            margin: 0 0 0.5mm;
          }
          /* V1.7.5 — Evaluation Policy card. Light sky-blue strip with
             a teal bar on the right (RTL) that reads as a "quality
             seal" on the screen; flattens to a clean monochrome block
             on the thermal printer. */
          .invoice-print-surface .pos-terms-heading {
            display: block;
            margin: 0 0 1mm;
            padding: 0.6mm 1.4mm;
            border-right: 2px solid #0369a1;
            background: #f0f9ff;
            font-size: 9px;
            font-weight: 700;
            color: #0c4a6e;
            letter-spacing: 0.01em;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .invoice-print-surface .pos-terms-heading-en {
            display: inline-block;
            margin-inline-start: 1.5mm;
            font-size: 7.5px;
            font-weight: 500;
            color: #0f766e;
            letter-spacing: 0.02em;
          }
          .invoice-print-surface .pos-terms-list {
            margin: 0;
            padding-inline-start: 3.5mm;
            list-style: arabic-indic;
          }
          .invoice-print-surface .pos-terms-list li {
            margin: 0 0 0.45mm;
            font-size: 7.8px;
            line-height: 1.5;
            color: #0f172a;
          }
          .invoice-print-surface .pos-terms-list li::marker {
            color: #0369a1;
            font-weight: 700;
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
