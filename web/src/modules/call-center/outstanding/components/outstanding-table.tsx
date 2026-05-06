import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Lock,
  MessageCircle,
  PencilLine,
  Phone,
  Receipt,
} from 'lucide-react';
import { Badge } from '@/modules/shared/components/ui/badge';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';
import { cn } from '@/lib/utils';
import type {
  CustomerCollectionStatusKind,
  OutstandingRow,
} from '../api/outstanding-api';

type Props = {
  rows: OutstandingRow[];
  loading: boolean;
  onEditStatus: (row: OutstandingRow) => void;
};

const STATUS_TONE: Record<CustomerCollectionStatusKind, string> = {
  NORMAL:
    'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200',
  LATE: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200',
  RISK: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-200',
};

function fmtKd(v: number): string {
  return new Intl.NumberFormat('ar-KW', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(v);
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('ar-KW');
  } catch {
    return '—';
  }
}

function buildWhatsAppLink(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  const normalized = digits.startsWith('965') ? digits : `965${digits}`;
  return `https://wa.me/${normalized}`;
}

/**
 * V19.x — Outstanding Payments aggregated table.
 * Pure presentational: every mutation routes back through the parent
 * via `onEditStatus`. Row actions never call backends inline so the
 * audit trail stays anchored to the dialog's submit handler.
 */
export function OutstandingTable({ rows, loading, onEditStatus }: Props) {
  const { t } = useTranslation();

  if (loading && rows.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground shadow-sm">
        {t('outstanding.table.loading', { defaultValue: 'جاري التحميل…' })}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground shadow-sm">
        {t('outstanding.table.empty', {
          defaultValue: 'لا توجد ذمم مستحقّة لهذه الفلاتر.',
        })}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              {t('outstanding.cols.customer', { defaultValue: 'العميل' })}
            </TableHead>
            <TableHead>
              {t('outstanding.cols.phone', { defaultValue: 'الهاتف' })}
            </TableHead>
            <TableHead>
              {t('outstanding.cols.driver', { defaultValue: 'السائق' })}
            </TableHead>
            <TableHead className="text-end">
              {t('outstanding.cols.invoices', {
                defaultValue: 'عدد الفواتير',
              })}
            </TableHead>
            <TableHead className="text-end">
              {t('outstanding.cols.totalDue', {
                defaultValue: 'إجمالي المستحق (د.ك)',
              })}
            </TableHead>
            <TableHead>
              {t('outstanding.cols.lastOrder', {
                defaultValue: 'آخر فاتورة',
              })}
            </TableHead>
            <TableHead className="text-end">
              {t('outstanding.cols.daysLate', {
                defaultValue: 'أيام التأخير',
              })}
            </TableHead>
            <TableHead className="text-end">
              {t('outstanding.cols.priority', { defaultValue: 'الأولوية' })}
            </TableHead>
            <TableHead>
              {t('outstanding.cols.status', { defaultValue: 'الحالة' })}
            </TableHead>
            <TableHead className="text-end">
              {t('outstanding.cols.actions', { defaultValue: 'الإجراءات' })}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.customerId}
              className={cn(
                row.blocked && 'bg-rose-50/40 dark:bg-rose-950/20',
              )}
            >
              <TableCell>
                <div className="flex flex-col gap-1">
                  <span className="font-medium">
                    {row.name ?? row.phone}
                  </span>
                  {row.blocked && (
                    <Badge
                      variant="destructive"
                      className="w-fit gap-1 text-[10px] uppercase"
                    >
                      <Lock className="size-3" aria-hidden />
                      {t('outstanding.badge.blocked', {
                        defaultValue: 'محظور',
                      })}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs">{row.phone}</TableCell>
              <TableCell>{row.driverName ?? '—'}</TableCell>
              <TableCell className="text-end">{row.invoicesCount}</TableCell>
              <TableCell className="text-end font-semibold">
                {fmtKd(row.totalDueKd)}
              </TableCell>
              <TableCell>{fmtDate(row.lastOrderAt)}</TableCell>
              <TableCell className="text-end">
                <span
                  className={cn(
                    'tabular-nums',
                    row.daysLate >= 14 && 'text-rose-700 dark:text-rose-300',
                    row.daysLate >= 7 &&
                      row.daysLate < 14 &&
                      'text-amber-700 dark:text-amber-300',
                  )}
                >
                  {row.daysLate}
                </span>
              </TableCell>
              <TableCell className="text-end font-mono text-xs">
                {fmtKd(row.priorityScore)}
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase',
                    STATUS_TONE[row.status],
                  )}
                >
                  {row.status === 'RISK' && (
                    <AlertTriangle className="size-3" aria-hidden />
                  )}
                  {t(`outstanding.status.${row.status.toLowerCase()}`, {
                    defaultValue:
                      row.status === 'NORMAL'
                        ? 'عادي'
                        : row.status === 'LATE'
                          ? 'متأخر'
                          : 'خطر',
                  })}
                </span>
              </TableCell>
              <TableCell className="text-end">
                <div className="flex items-center justify-end gap-1">
                  <a
                    href={`tel:${row.phone}`}
                    className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    title={t('outstanding.actions.call', {
                      defaultValue: 'اتصال',
                    })}
                    aria-label={t('outstanding.actions.call', {
                      defaultValue: 'اتصال',
                    })}
                  >
                    <Phone className="size-4" aria-hidden />
                  </a>
                  <a
                    href={buildWhatsAppLink(row.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    title={t('outstanding.actions.whatsapp', {
                      defaultValue: 'واتساب',
                    })}
                    aria-label={t('outstanding.actions.whatsapp', {
                      defaultValue: 'واتساب',
                    })}
                  >
                    <MessageCircle className="size-4" aria-hidden />
                  </a>
                  <Link
                    to={`/cc/customers/${row.customerId}`}
                    className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    title={t('outstanding.actions.viewInvoices', {
                      defaultValue: 'فواتير العميل',
                    })}
                    aria-label={t('outstanding.actions.viewInvoices', {
                      defaultValue: 'فواتير العميل',
                    })}
                  >
                    <Receipt className="size-4" aria-hidden />
                  </Link>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => onEditStatus(row)}
                    title={t('outstanding.actions.editStatus', {
                      defaultValue: 'تعديل الحالة',
                    })}
                    aria-label={t('outstanding.actions.editStatus', {
                      defaultValue: 'تعديل الحالة',
                    })}
                  >
                    <PencilLine className="size-4" aria-hidden />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
