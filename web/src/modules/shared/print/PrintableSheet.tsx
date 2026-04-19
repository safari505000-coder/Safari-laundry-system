import { type ReactNode, useCallback } from 'react';
import { Printer, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BRAND } from '@/lib/brand';
import { Button } from '@/modules/shared/components/ui/button';
import { DocumentQR, type DocumentType } from './DocumentQR';
import './printable.css';

/**
 * Shared digital-A4 printable container used by every HR form
 * (payslip, attendance report, leave request, loan acknowledgement).
 *
 * Guarantees:
 *   • The printed output matches the on-screen layout pixel-for-pixel
 *     (same DOM, same CSS — `@media print` only strips chrome).
 *   • RTL, Arabic-first, colored with the Safari Omni brand palette.
 *   • A verification QR is always stamped on the footer so the
 *     document is machine-verifiable without login.
 *
 * Callers provide the body via `children` and the form-specific meta
 * via props; everything else (branding, QR, footer, print button) is
 * rendered here.
 */

export type PrintableSheetProps = {
  docType: DocumentType;
  docId: string;
  docNumber?: string;
  issuedAtIso?: string;
  /** e.g. "كشف راتب — يوليو 2026". */
  title: string;
  /** e.g. period, employee, status chip. */
  subtitle?: string;
  /** Optional status stamp shown near the title. */
  status?: { label: string; kind: 'approved' | 'rejected' | 'pending' | 'paid' };
  /** Main body of the form. */
  children: ReactNode;
  /** Optional back navigation (defaults to router back). */
  onBack?: () => void;
};

export function PrintableSheet({
  docType,
  docId,
  docNumber,
  issuedAtIso,
  title,
  subtitle,
  status,
  children,
  onBack,
}: PrintableSheetProps) {
  const navigate = useNavigate();

  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }, []);

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  }, [onBack, navigate]);

  const now = new Date();
  const issued = issuedAtIso ? new Date(issuedAtIso) : now;

  return (
    <div className="printable-sheet-viewport">
      <div className="printable-sheet-toolbar print-hide">
        <Button variant="outline" onClick={handleBack}>
          <ArrowRight className="ms-1 h-4 w-4" />
          رجوع
        </Button>
        <Button onClick={handlePrint}>
          <Printer className="ms-1 h-4 w-4" />
          طباعة / PDF
        </Button>
      </div>

      <article className="printable-sheet">
        <header className="printable-sheet__brandbar">
          <div className="printable-sheet__brand-left">
            <div className="printable-sheet__brand-name">{BRAND.systemAr}</div>
            <div className="printable-sheet__brand-legal">{BRAND.customerAr}</div>
          </div>
          <div className="printable-sheet__brand-right">
            <div className="printable-sheet__doc-title">
              {title}
              {status ? (
                <span
                  className={`printable-sheet__stamp printable-sheet__stamp--${status.kind}`}
                  style={{ marginInlineStart: '3mm', fontSize: '9pt' }}
                >
                  {status.label}
                </span>
              ) : null}
            </div>
            {subtitle ? (
              <div className="printable-sheet__doc-meta">{subtitle}</div>
            ) : null}
            <div className="printable-sheet__doc-meta">
              تاريخ الإصدار: {issued.toLocaleDateString('ar-KW')} —{' '}
              {issued.toLocaleTimeString('ar-KW', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
            {docNumber ? (
              <div className="printable-sheet__doc-meta">
                رقم المستند: {docNumber}
              </div>
            ) : null}
          </div>
        </header>

        <main className="printable-sheet__body">{children}</main>

        <footer className="printable-sheet__footer">
          <DocumentQR
            docType={docType}
            docId={docId}
            docNumber={docNumber}
            issuedAtIso={issuedAtIso ?? now.toISOString()}
          />
          <div style={{ textAlign: 'end' }}>
            <div>{BRAND.copyrightAr}</div>
            <div style={{ marginTop: '1mm' }}>{BRAND.copyrightEn}</div>
          </div>
        </footer>
      </article>
    </div>
  );
}

// Re-exports so printable pages can import structural helpers.
export { DocumentQR } from './DocumentQR';
export type { DocumentType } from './DocumentQR';
