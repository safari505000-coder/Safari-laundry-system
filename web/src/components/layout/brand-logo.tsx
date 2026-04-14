type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <img
      src="/logo.png"
      alt="Safari Fast"
      height={40}
      width={160}
      decoding="async"
      className={`box-border h-[40px] w-auto max-h-[40px] max-w-[200px] shrink-0 object-contain object-left bg-transparent p-0 border-0 outline-none ring-0 ${className ?? ''}`}
    />
  );
}
