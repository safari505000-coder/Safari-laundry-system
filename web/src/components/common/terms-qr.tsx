import { QRCodeSVG } from 'qrcode.react';

/**
 * V19.22 — Invoice QR.
 *
 * Before V19.22 this always encoded a static terms URL. Now, when an
 * `orderId` is supplied, the QR points at the public per-order rating
 * page (`/r/:orderId`) hosted by the SPA. That page shows:
 *   • the invoice summary (serial / total / date / driver first name)
 *   • an interactive 5-star rating + note
 *   • the full terms & conditions (collapsed by default)
 *
 * So the terms surface is still reachable from every printed receipt,
 * but the QR now doubles as the customer's feedback channel straight
 * to Owner / GM / Call-Center.
 *
 * If no `orderId` is passed (e.g. preview mockups), the QR falls back
 * to the legacy terms URL so nothing regresses.
 */
const TERMS_FALLBACK_URL =
  (import.meta.env.VITE_TERMS_URL as string | undefined)?.trim() ||
  'https://safari-express.com/terms';

type Props = {
  size?: number;
  className?: string;
  /**
   * When provided, the QR encodes `<origin>/r/<orderId>` so the
   * customer lands on the dedicated rating micro-page.
   */
  orderId?: string;
};

function buildQrTarget(orderId: string | undefined): string {
  if (!orderId) return TERMS_FALLBACK_URL;
  // Read the current origin at render time so the QR works whether
  // the receipt is generated on localhost, staging, or production.
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://safariomni.com';
  return `${origin}/r/${encodeURIComponent(orderId)}`;
}

export function TermsQr({ size = 84, className, orderId }: Props) {
  const value = buildQrTarget(orderId);
  return (
    <div className={className}>
      <QRCodeSVG value={value} size={size} includeMargin />
    </div>
  );
}
