type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <img
      src="/logo.png"
      alt="Safari Fast"
      height={44}
      width={176}
      decoding="async"
      className={`me-[10px] box-border h-[44px] w-auto max-h-[45px] max-w-[220px] shrink-0 object-contain object-left bg-transparent p-0 border-0 outline-none ring-0 ${className ?? ''}`}
    />
  );
}
