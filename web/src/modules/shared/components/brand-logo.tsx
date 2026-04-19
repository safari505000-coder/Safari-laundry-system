import { useTranslation } from 'react-i18next';
import { BRAND } from '@/lib/brand';

type BrandLogoProps = {
  className?: string;
  compact?: boolean;
};

/**
 * V6.8 — Shell brand mark. Renders the internal "Safari Omni" product
 * identity (never the customer-facing trade name). The SVG uses the new
 * Sapphire → deep-sapphire gradient with a Gold accent dot to match the
 * refreshed palette.
 */
export function BrandLogo({ className, compact = false }: BrandLogoProps) {
  const { i18n } = useTranslation();
  const rtl = i18n.language?.startsWith('ar') ?? false;
  const systemName = rtl ? BRAND.systemAr : BRAND.systemEn;

  return (
    <div className={`inline-flex items-center gap-3 ${className ?? ''}`}>
      <svg
        viewBox="0 0 64 64"
        aria-label={`${BRAND.systemEn} Logo`}
        className="h-11 w-11 shrink-0"
      >
        <defs>
          <linearGradient id="omniGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0F52BA" />
            <stop offset="100%" stopColor="#0A2A6C" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#omniGrad)" />
        <path
          d="M18 36c0-7.7 6.3-14 14-14s14 6.3 14 14"
          fill="none"
          stroke="#ffffff"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx="32" cy="36" r="5" fill="#ffffff" />
        <circle cx="49" cy="15" r="4" fill="#D4AF37" />
      </svg>
      {!compact ? (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-base font-bold tracking-tight text-foreground">
            {systemName}
          </p>
          <p className="truncate text-[10px] uppercase tracking-[0.16em] text-primary/80">
            {BRAND.systemTagline}
          </p>
        </div>
      ) : null}
    </div>
  );
}
