import { QRCodeSVG } from 'qrcode.react';

const TERMS_URL =
  (import.meta.env.VITE_TERMS_URL as string | undefined)?.trim() ||
  'https://safari-express.com/terms';

type Props = {
  size?: number;
  className?: string;
};

export function TermsQr({ size = 84, className }: Props) {
  return (
    <div className={className}>
      <QRCodeSVG value={TERMS_URL} size={size} includeMargin />
    </div>
  );
}
