import Barcode from 'react-barcode';
import { cn } from '@/lib/utils';

type Props = {
  orderId: string;
  className?: string;
  /** Narrow receipt / wide screen */
  variant?: 'receipt' | 'default';
  /**
   * Human-readable line under the bars (e.g. same as INV#: `A-3` or short id).
   * The barcode still encodes `orderId` for internal scans. When omitted,
   * the encoded value is shown under the bars (legacy: full uuid).
   */
  displayLabel?: string;
};

export function OrderIdBarcode({
  orderId,
  className,
  variant = 'default',
  displayLabel,
}: Props) {
  const v = orderId.trim();
  if (!v) return null;
  const narrow = variant === 'receipt';
  const label = displayLabel?.trim();
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-black',
        className,
      )}
    >
      <Barcode
        value={v}
        format="CODE128"
        displayValue={!label}
        fontSize={narrow ? 9 : 11}
        width={narrow ? 1 : 1.4}
        height={narrow ? 28 : 48}
        margin={0}
        renderer="svg"
        background="#ffffff"
        lineColor="#000000"
      />
      {label ?
        <p
          className={cn(
            'm-0 mt-0.5 max-w-[68mm] text-center',
            narrow ? 'text-[9px] leading-tight' : 'text-[11px]',
            'font-mono tabular-nums text-black',
          )}
        >
          {label}
        </p>
      : null}
    </div>
  );
}
