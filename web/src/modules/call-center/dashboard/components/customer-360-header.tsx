import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Phone,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import { Button } from '@/modules/shared/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import type { Customer360Data } from '../hooks/use-cc-customer-360';
import { BlockUnblockDialog } from './block-unblock-dialog';
import { CreateDispatchDialog } from './create-dispatch-dialog';

type Props = {
  data: Customer360Data;
  onMutated: () => void;
  onBack?: () => void;
};

export function Customer360Header({ data, onMutated, onBack }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canManageCustomer = can(user, 'customers.manage');

  const [blockOpen, setBlockOpen] = useState(false);
  const [unblockOpen, setUnblockOpen] = useState(false);
  const [createDispatchOpen, setCreateDispatchOpen] = useState(false);

  const f = data.statement.financials;
  const isBlocked = f.isBlocked;
  const displayName = data.customer.displayName ?? data.customer.phone;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {onBack ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onBack}
                aria-label={t('common.back', { defaultValue: 'رجوع' })}
              >
                <ArrowLeft className="size-4" aria-hidden />
              </Button>
            ) : null}
            <h2 className="font-heading truncate text-2xl font-semibold">
              {displayName}
            </h2>
            <StatusBadge isBlocked={isBlocked} />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <a
              href={`tel:${data.customer.phone}`}
              className="inline-flex items-center gap-1 hover:text-foreground"
              dir="ltr"
            >
              <Phone className="size-3.5" aria-hidden />
              {data.customer.phone}
            </a>
            {data.customer.phone2 ? (
              <a
                href={`tel:${data.customer.phone2}`}
                className="inline-flex items-center gap-1 opacity-80 hover:text-foreground"
                dir="ltr"
              >
                <Phone className="size-3.5" aria-hidden />
                {data.customer.phone2}
              </a>
            ) : null}
          </div>

          {isBlocked && f.blockReason ? (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              <ShieldOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className="leading-relaxed">
                {t('callCenterDashboard.header.blockReason', {
                  defaultValue: 'سبب الحظر',
                })}
                : {f.blockReason}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canManageCustomer ? (
            isBlocked ? (
              <Button
                variant="success"
                size="sm"
                onClick={() => setUnblockOpen(true)}
              >
                <ShieldCheck className="size-3.5" aria-hidden />
                {t('callCenterDashboard.header.unblockCta', {
                  defaultValue: 'إلغاء الحظر',
                })}
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBlockOpen(true)}
              >
                <ShieldAlert className="size-3.5" aria-hidden />
                {t('callCenterDashboard.header.blockCta', {
                  defaultValue: 'حظر العميل',
                })}
              </Button>
            )
          ) : null}

          <Button
            size="sm"
            onClick={() => setCreateDispatchOpen(true)}
            disabled={isBlocked}
            title={
              isBlocked
                ? t('callCenterDashboard.header.dispatchBlockedTooltip', {
                    defaultValue: 'العميل محظور — لا يمكن إصدار مهمة',
                  })
                : undefined
            }
          >
            <Send className="size-3.5" aria-hidden />
            {t('callCenterDashboard.header.createDispatchCta', {
              defaultValue: 'إصدار مهمة',
            })}
          </Button>
        </div>
      </div>

      <BlockUnblockDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        mode="block"
        customerId={data.customer.id}
        customerName={displayName}
        onDone={onMutated}
      />
      <BlockUnblockDialog
        open={unblockOpen}
        onOpenChange={setUnblockOpen}
        mode="unblock"
        customerId={data.customer.id}
        customerName={displayName}
        onDone={onMutated}
      />
      <CreateDispatchDialog
        open={createDispatchOpen}
        onOpenChange={setCreateDispatchOpen}
        customerId={data.customer.id}
        customerName={displayName}
        isCustomerBlocked={isBlocked}
        onCreated={onMutated}
      />
    </div>
  );
}

function StatusBadge({ isBlocked }: { isBlocked: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        isBlocked
          ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
      )}
      role="status"
    >
      {isBlocked ? (
        <ShieldOff className="size-3" aria-hidden />
      ) : (
        <ShieldCheck className="size-3" aria-hidden />
      )}
      {isBlocked
        ? t('callCenterDashboard.header.blockedBadge', {
            defaultValue: 'محظور',
          })
        : t('callCenterDashboard.header.activeBadge', {
            defaultValue: 'نشط',
          })}
    </span>
  );
}
