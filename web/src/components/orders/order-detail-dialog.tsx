import { useTranslation } from 'react-i18next';
import type { OrderRow } from '@/lib/api';
import { useAppLocale } from '@/hooks/use-app-locale';
import { formatKwdLabel } from '@/lib/kwd';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { OrderIdBarcode } from '@/components/orders/order-id-barcode';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderRow | null;
};

export function OrderDetailDialog({ open, onOpenChange, order }: Props) {
  const { t } = useTranslation();
  const dateLocale = useAppLocale();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('orders.detailTitle')}</DialogTitle>
        </DialogHeader>
        {order ?
          <div className="space-y-4">
            <div className="flex justify-center rounded-lg border bg-muted/30 p-3">
              <OrderIdBarcode orderId={order.id} />
            </div>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t('orders.colCreated')}</dt>
                <dd className="text-end font-medium">
                  {new Date(order.createdAt).toLocaleString(dateLocale)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t('orders.colInvoice')}</dt>
                <dd className="font-mono text-xs">
                  {order.invoiceNumber ?? order.id.slice(0, 8)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t('orders.colStatus')}</dt>
                <dd>
                  <Badge variant="secondary" className="font-normal">
                    {t(`orderStatus.${order.status}`, {
                      defaultValue: order.status,
                    })}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t('orders.colCustomer')}</dt>
                <dd className="text-end">
                  {order.customer.displayName ?? order.customer.phone}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t('orders.colTotal')}</dt>
                <dd className="font-semibold tabular-nums">
                  {formatKwdLabel(order.totalPrice)}
                </dd>
              </div>
            </dl>
            {order.lineItems.length > 0 ?
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {t('orders.detailLines')}
                </p>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t('orders.lineItem')}</TableHead>
                      <TableHead className="text-end">{t('orders.lineQty')}</TableHead>
                      <TableHead className="text-end">{t('orders.linePrice')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.lineItems.map((li) => (
                      <TableRow key={li.id}>
                        <TableCell className="text-sm">
                          {li.label ?? '—'}
                        </TableCell>
                        <TableCell className="text-end tabular-nums text-sm">
                          {li.quantity}
                        </TableCell>
                        <TableCell className="text-end tabular-nums text-sm">
                          {formatKwdLabel(li.unitPrice)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            : null}
          </div>
        : null}
      </DialogContent>
    </Dialog>
  );
}
