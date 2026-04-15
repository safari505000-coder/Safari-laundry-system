import Barcode from 'react-barcode';
import { cn } from '@/lib/utils';

type Props = {
  orderId: string;
  className?: string;
  /** Narrow receipt / wide screen */
  variant?: 'receipt' | 'default';
};

export function OrderIdBarcode({ orderId, className, variant = 'default' }: Props) {
  const v = orderId.trim();
  if (!v) return null;
  const narrow = variant === 'receipt';
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
        displayValue
        fontSize={narrow ? 9 : 11}
        width={narrow ? 1 : 1.4}
        height={narrow ? 28 : 48}
        margin={0}
        renderer="svg"
        background="#ffffff"
        lineColor="#000000"
      />
    </div>
  );
}
