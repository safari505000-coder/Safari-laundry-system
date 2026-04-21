import { QRCodeSVG } from 'qrcode.react';

/**
 * Digital verification QR embedded on every printed HR document.
 *
 * Scanning the QR opens `/api/verify/:docType/:id` which returns a
 * signed-friendly JSON payload confirming the document number, issue
 * date, and the party it was issued to. This is the "digital barcode"
 * requirement from the Dustur: every A4 printout carries a machine-
 * readable stamp so an auditor can verify authenticity without logging
 * in.
 */
export type DocumentType =
  | 'PAYSLIP'
  | 'ATTENDANCE_REPORT'
  | 'LEAVE_REQUEST'
  | 'EMPLOYEE_LOAN'
  // V19.7.5 — printable POS invoice opened from the Customer 360
  // ledger ("عرض صورة الفاتورة"). Same Safari-brand A4 sheet as the
  // HR forms so auditors and customers recognise the format instantly.
  | 'INVOICE'
  // V19.8.4 — printable customer statement (كشف حساب العميل). Full
  // financial history with an embedded money-flow breakdown for each
  // subscription activation so customers see exactly where their
  // renewal money went.
  | 'STATEMENT';

export type DocumentQRProps = {
  docType: DocumentType;
  docId: string;
  docNumber?: string;
  issuedAtIso?: string;
  /** Optional override; defaults to `window.location.origin`. */
  baseUrl?: string;
  /** Smaller QR when tight on space. Default 22mm. */
  sizeMm?: number;
};

export function buildVerifyUrl(
  docType: DocumentType,
  docId: string,
  baseUrl?: string,
): string {
  const origin =
    baseUrl ??
    (typeof window !== 'undefined' ? window.location.origin : 'https://app');
  return `${origin.replace(/\/$/, '')}/api/verify/${docType.toLowerCase()}/${docId}`;
}

export function DocumentQR({
  docType,
  docId,
  docNumber,
  issuedAtIso,
  baseUrl,
  sizeMm = 22,
}: DocumentQRProps) {
  const url = buildVerifyUrl(docType, docId, baseUrl);
  const sizePx = Math.round(sizeMm * 3.78);

  const labels: Record<DocumentType, string> = {
    PAYSLIP: 'كشف راتب',
    ATTENDANCE_REPORT: 'تقرير حضور',
    LEAVE_REQUEST: 'طلب إجازة',
    EMPLOYEE_LOAN: 'إقرار سلفة',
    INVOICE: 'فاتورة',
    STATEMENT: 'كشف حساب',
  };

  return (
    <div className="printable-sheet__qr">
      <QRCodeSVG
        value={url}
        size={sizePx}
        level="M"
        marginSize={0}
        bgColor="#ffffff"
        fgColor="#0f172a"
        className="printable-sheet__qr-img"
      />
      <div className="printable-sheet__qr-info">
        <div>
          <strong>{labels[docType]}</strong>
        </div>
        {docNumber ? (
          <div>
            رقم المستند: <strong>{docNumber}</strong>
          </div>
        ) : (
          <div>
            المعرف: <strong>{docId.slice(0, 8)}…</strong>
          </div>
        )}
        {issuedAtIso ? (
          <div>
            تاريخ الإصدار:{' '}
            <strong>{new Date(issuedAtIso).toLocaleDateString('en-GB')}</strong>
          </div>
        ) : null}
        <div>امسح للتحقق</div>
      </div>
    </div>
  );
}
