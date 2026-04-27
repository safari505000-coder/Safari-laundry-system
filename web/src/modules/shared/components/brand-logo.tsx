import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';

type BrandLogoProps = {
  className?: string;
  compact?: boolean;
  /**
   * High-contrast text + brighter icon for dark backgrounds (login, system closed).
   * Default uses theme `foreground` / `primary` (suited to light sidebars / paper).
   */
  tone?: 'default' | 'onDark';
};

/**
 * V6.8 — Shell brand mark. Renders the internal "Safari Omni" product
 * identity (never the customer-facing trade name). The SVG uses the new
 * Sapphire → deep-sapphire gradient with a Gold accent dot to match the
 * refreshed palette. Use `tone="onDark"` on navy/black hero backgrounds.
 */
export function BrandLogo({
  className,
  compact = false,
  tone = 'default',
}: BrandLogoProps) {
  const { i18n } = useTranslation();
  const uid = useId().replace(/:/g, '');
  const gradId = `omniGrad-${uid}`;
  const rtl = i18n.language?.startsWith('ar') ?? false;
  const systemName = rtl ? BRAND.systemAr : BRAND.systemEn;
  const onDark = tone === 'onDark';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-3',
        onDark && 'drop-shadow-sm',
        className,
      )}
    >
      <svg
        viewBox="0 0 64 64"
        aria-label={`${BRAND.systemEn} Logo`}
        className="h-11 w-11 shrink-0"
      >
        <defs>
          <linearGradient
            id={gradId}
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            {onDark ?
              <>
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#1d4ed8" />
              </>
            : <>
                <stop offset="0%" stopColor="#0F52BA" />
                <stop offset="100%" stopColor="#0A2A6C" />
              </>
            }
          </linearGradient>
        </defs>
        <rect
          x="4"
          y="4"
          width="56"
          height="56"
          rx="14"
          fill={`url(#${gradId})`}
          stroke={onDark ? 'rgba(255,255,255,0.35)' : 'none'}
          strokeWidth={onDark ? 1.5 : 0}
        />
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
      {!compact ?
        <div className="min-w-0 leading-tight">
          <p
            className={cn(
              'truncate text-base font-bold tracking-tight',
              onDark ?
                'text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]'
              : 'text-foreground',
            )}
          >
            {systemName}
          </p>
          <p
            className={cn(
              'truncate text-[10px] uppercase tracking-[0.16em]',
              onDark ?
                'font-medium text-cyan-200 [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]'
              : 'text-primary/80',
            )}
          >
            {BRAND.systemTagline}
          </p>
        </div>
      : null}
    </div>
  );
}
