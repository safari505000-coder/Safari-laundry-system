import { useTranslation } from 'react-i18next';
import { Loader2, MessageCircle, Phone, Receipt } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { ACCESS } from '@/modules/shared/auth/access-matrix';
import { formatKwdLabel } from '@/lib/kwd';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';
import type {
  ControlTowerRiskLevel,
  ControlTowerRow,
  ControlTowerSlaStatus,
} from '../api/control-tower-api';

function buildWhatsAppLink(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  const normalized = digits.startsWith('965') ? digits : `965${digits}`;
  return `https://wa.me/${normalized}`;
}

function slaBadgeClass(s: ControlTowerSlaStatus): string {
  switch (s) {
    case 'BREACHED':
      return 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100';
    case 'ESCALATED':
      return 'bg-orange-100 text-orange-950 dark:bg-orange-950 dark:text-orange-100';
    case 'LATE':
      return 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100';
    default:
      return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100';
  }
}

function riskBadgeClass(r: ControlTowerRiskLevel): string {
  switch (r) {
    case 'RISK':
      return 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100';
    case 'LATE':
      return 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100';
    default:
      return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100';
  }
}

function customerHref(customerId: string, canCc360: boolean): string {
  return canCc360
    ? `/cc/customers/${customerId}`
    : `/customers?focus=${encodeURIComponent(customerId)}`;
}

export function ControlTowerRiskTable({
  rows,
  loading,
}: {
  rows: ControlTowerRow[];
  loading: boolean;
}) {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canCc360 = hasRole(...ACCESS['ccDashboard.view']);

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t('controlTower.riskTable.title')}</h2>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">{t('controlTower.cols.customer')}</TableHead>
              <TableHead className="whitespace-nowrap">{t('controlTower.cols.phone')}</TableHead>
              <TableHead className="whitespace-nowrap">{t('controlTower.cols.driver')}</TableHead>
              <TableHead className="text-end whitespace-nowrap">
                {t('controlTower.cols.totalDue')}
              </TableHead>
              <TableHead className="text-end whitespace-nowrap">
                {t('controlTower.cols.daysLate')}
              </TableHead>
              <TableHead className="whitespace-nowrap">{t('controlTower.cols.collection')}</TableHead>
              <TableHead className="whitespace-nowrap">{t('controlTower.cols.sla')}</TableHead>
              <TableHead className="w-[1%] text-end whitespace-nowrap">
                {t('controlTower.cols.actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center">
                  <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" aria-hidden />
                  <span className="sr-only">{t('controlTower.table.loading')}</span>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                  {t('controlTower.table.empty')}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.customerId}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col gap-0.5">
                      <span>{row.customerName}</span>
                      {row.blocked ? (
                        <span className="text-[10px] font-normal uppercase text-rose-600">
                          {t('controlTower.badge.blocked')}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{row.phone}</TableCell>
                  <TableCell>{row.driverName}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatKwdLabel(row.totalDue)}</TableCell>
                  <TableCell className="text-end tabular-nums">{row.daysLate}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${riskBadgeClass(row.riskLevel)}`}
                    >
                      {t(`controlTower.collection.${row.riskLevel.toLowerCase()}`)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${slaBadgeClass(row.slaStatus)}`}
                      title={
                        row.hasActiveDispatch && row.dispatchStatus ?
                          `${row.dispatchStatus}`
                        : undefined
                      }
                    >
                      {t(`controlTower.sla.${row.slaStatus.toLowerCase()}`)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <a
                        href={`tel:${row.phone.replace(/[^\d+]/g, '')}`}
                        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        title={t('controlTower.actions.call')}
                        aria-label={t('controlTower.actions.call')}
                      >
                        <Phone className="size-4" aria-hidden />
                      </a>
                      <a
                        href={buildWhatsAppLink(row.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        title={t('controlTower.actions.whatsapp')}
                        aria-label={t('controlTower.actions.whatsapp')}
                      >
                        <MessageCircle className="size-4" aria-hidden />
                      </a>
                      <Link
                        to={customerHref(row.customerId, canCc360)}
                        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        title={t('controlTower.actions.open360')}
                        aria-label={t('controlTower.actions.open360')}
                      >
                        <Receipt className="size-4" aria-hidden />
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
