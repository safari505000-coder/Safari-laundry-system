type BrandLogoProps = {
  className?: string;
  compact?: boolean;
};

export function BrandLogo({ className, compact = false }: BrandLogoProps) {
  return (
    <div className={`inline-flex items-center gap-3 ${className ?? ''}`}>
      <svg
        viewBox="0 0 64 64"
        aria-label="Safari Omni AI Logo"
        className="h-11 w-11 shrink-0"
      >
        <defs>
          <linearGradient id="omniGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1e90ff" />
            <stop offset="100%" stopColor="#6d5efc" />
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
        <circle cx="49" cy="15" r="4" fill="#7cf2ff" />
      </svg>
      {!compact ? (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-base font-bold tracking-tight text-foreground">
            Safari Omni
          </p>
          <p className="truncate text-[10px] uppercase tracking-[0.16em] text-primary/80">
            AI-Powered Operations
          </p>
        </div>
      ) : null}
    </div>
  );
}
