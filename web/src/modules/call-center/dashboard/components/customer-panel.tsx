import { useEffect, useState } from 'react';
import {
  ExternalLink,
  Lightbulb,
  MessageCircle,
  Phone,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { Button, buttonVariants } from '@/modules/shared/components/ui/button';
import { CustomerLedgerPanel } from '@/modules/call-center/components/customer-ledger-panel';
import { cn } from '@/lib/utils';
import type { OutstandingRow } from '@/modules/call-center/outstanding/api/outstanding-api';

type Props = {
  open: boolean;
  row: OutstandingRow | null;
  onClose: () => void;
};

function formatKwd(value: number): string {
  if (!Number.isFinite(value)) return '0.000';
  return new Intl.NumberFormat('ar-KW', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(value);
}

function normalisePhoneForLink(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('965')) return digits;
  if (digits.startsWith('0')) return `965${digits.slice(1)}`;
  if (digits.length === 8) return `965${digits}`;
  return digits;
}

function buildSuggestion(row: OutstandingRow): string {
  const name = row.name ?? row.phone;
  const debt = formatKwd(row.totalDueKd);
  const inv = row.invoicesCount;
  if (row.blocked) {
    return `الأخ/الأخت ${name} حسابك متوقّف عن الإصدار حالياً، وعليه ${debt} د.ك (${inv} فاتورة). سدّد المبلغ ليُفعَّل الحساب فوراً.`;
  }
  if (row.status === 'RISK' || row.daysLate >= 14) {
    return `الأخ/الأخت ${name} لاحظنا تأخّر ${row.daysLate} يوم وعليك ${debt} د.ك (${inv} فاتورة). نرسل لك رابط الدفع الآن لتسديد سريع وتفادي الإيقاف.`;
  }
  if (row.daysLate >= 7) {
    return `الأخ/الأخت ${name} يوجد لديك مبلغ مستحق ${debt} د.ك (${inv} فاتورة). تفضّل بالسداد عبر الكاش، K-NET، أو رابط الدفع.`;
  }
  return `الأخ/الأخت ${name} هذه مكالمة تذكير ودّيّة. لديك ${debt} د.ك (${inv} فاتورة) — هل تفضّل السداد كاشاً، K-NET، أم رابط دفع عبر واتساب؟`;
}

/**
 * Customer 360 side panel — wraps the existing
 * `CustomerLedgerPanel` (which already implements
 * Overview / Invoices / Payments / Activity tabs and reads
 * `/api/call-center/customers/:id/ledger`). The cockpit only adds a
 * fixed slide-in chrome around it plus a Next-Best-Action card built
 * from the per-row outstanding fields the agent already has — no new
 * APIs, no monetary recomputation.
 */
export function CustomerPanel({ open, row, onClose }: Props) {
  const { token } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
    const t = window.setTimeout(() => setMounted(false), 200);
    return () => window.clearTimeout(t);
  }, [open, onClose]);

  if (!mounted && !open) return null;

  const phoneLink = row ? `tel:${normalisePhoneForLink(row.phone)}` : '#';
  const waLink = row
    ? `https://wa.me/${normalisePhoneForLink(row.phone)}`
    : '#';
  const suggestion = row ? buildSuggestion(row) : null;

  return (
    <>
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="ملف العميل ٣٦٠"
        className={cn(
          'fixed inset-y-0 z-50 flex w-full max-w-xl flex-col border-border bg-background shadow-2xl transition-transform duration-200',
          'ltr:right-0 ltr:border-l rtl:left-0 rtl:border-r',
          open ? 'translate-x-0' : 'rtl:-translate-x-full ltr:translate-x-full',
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border bg-card/60 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">ملف العميل</p>
            <h3 className="truncate font-heading text-lg font-semibold">
              {row?.name ?? row?.phone ?? 'بدون اسم'}
            </h3>
            {row ? (
              <p
                dir="ltr"
                className="mt-0.5 truncate text-xs text-muted-foreground"
              >
                {row.phone}
                {row.phone2 ? ` · ${row.phone2}` : ''}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="إغلاق"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-4 py-3">
          <a
            href={phoneLink}
            className={cn(
              buttonVariants({ variant: 'default', size: 'sm' }),
              'h-8',
            )}
          >
            <Phone className="size-3.5" aria-hidden />
            اتصال
          </a>
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'h-8',
            )}
          >
            <MessageCircle className="size-3.5" aria-hidden />
            واتساب
          </a>
          {row ? (
            <Link
              to={`/cc/customers/${row.customerId}`}
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'h-8',
              )}
            >
              <ExternalLink className="size-3.5" aria-hidden />
              صفحة كاملة
            </Link>
          ) : null}
          {row ? (
            <span className="ms-auto rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-900/40 dark:text-rose-100">
              مستحق: {formatKwd(row.totalDueKd)} د.ك
            </span>
          ) : null}
        </div>

        {suggestion ? (
          <div className="flex items-start gap-2 border-b border-border bg-amber-50/60 px-4 py-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">اقتراح المكالمة</p>
              <p className="mt-1 leading-relaxed">{suggestion}</p>
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {row ? (
            <CustomerLedgerPanel customerId={row.customerId} token={token} />
          ) : (
            <p className="text-sm text-muted-foreground">
              اختر عميلاً من قائمة الأولوية لعرض ملفه الكامل.
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
