import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ScanBarcode } from 'lucide-react';
import { type OrderRow, apiJson, ApiError } from '@/lib/api';
import { normalizeScannedOrderId } from '@/lib/order-scan';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Props = {
  token: string | null;
  onOrderLoaded: (order: OrderRow) => void;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
};

export function OrderScanInput({
  token,
  onOrderLoaded,
  className,
  inputClassName,
  disabled,
}: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  const lookup = useCallback(
    async (raw: string) => {
      const id = normalizeScannedOrderId(raw);
      if (!token || !id) return;
      setLoading(true);
      try {
        const order = await apiJson<OrderRow>(`/api/orders/${id}`, { token });
        onOrderLoaded(order);
        setValue('');
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        setLoading(false);
      }
    },
    [token, onOrderLoaded],
  );

  return (
    <div className={cn('relative min-w-0', className)}>
      <ScanBarcode
        className="pointer-events-none absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        value={value}
        disabled={disabled || loading || !token}
        placeholder={t('orders.scanPlaceholder')}
        className={cn('bg-background ps-9', inputClassName)}
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void lookup(value);
          }
        }}
      />
    </div>
  );
}
