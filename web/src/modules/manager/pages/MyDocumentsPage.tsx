import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  FileText,
  HandCoins,
  Loader2,
  Printer,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { notify } from '@/lib/notify';
import {
  getManagerDocuments,
  type ManagerDocumentKind,
  type ManagerDocumentRow,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { Badge } from '@/modules/shared/components/ui/badge';
import {
  Button,
  buttonVariants,
} from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { Input } from '@/modules/shared/components/ui/input';
import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * V19.22.5 — Branch Manager "مستنداتي" (My Documents).
 *
 * Unified printable feed of every Accountant-approved document the
 * manager owns:
 *   • CUSTODY_RECEIPT  — verified cash-handover bags.
 *   • EXPENSE_VOUCHER  — approved branch expenses on the manager's
 *     branch (or ones the manager personally submitted).
 *
 * Each row exposes a Print button that opens the matching printable
 * page. The feed is server-sorted desc by document date.
 */

const KIND_META: Record<
  ManagerDocumentKind,
  {
    icon: typeof HandCoins;
    tone: string;
    badgeClass: string;
    labelKey: string;
  }
> = {
  CUSTODY_RECEIPT: {
    icon: HandCoins,
    tone: 'from-emerald-50 to-emerald-100 border-emerald-200',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-200',
    labelKey: 'myDocuments.kinds.CUSTODY_RECEIPT',
  },
  EXPENSE_VOUCHER: {
    icon: Wallet,
    tone: 'from-amber-50 to-amber-100 border-amber-200',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-200',
    labelKey: 'myDocuments.kinds.EXPENSE_VOUCHER',
  },
};

export function MyDocumentsPage() {
  const { t } = useTranslation();
  const dateLocale = useAppLocale();
  const { token } = useAuth();
  const [rows, setRows] = useState<ManagerDocumentRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<'ALL' | ManagerDocumentKind>(
    'ALL',
  );
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await getManagerDocuments(token);
      setRows(data);
    } catch (e) {
      notify.error(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const base = rows ?? [];
    const needle = q.trim().toLowerCase();
    return base.filter((r) => {
      if (kindFilter !== 'ALL' && r.kind !== kindFilter) return false;
      if (!needle) return true;
      return (
        r.title.toLowerCase().includes(needle) ||
        (r.subtitle?.toLowerCase().includes(needle) ?? false) ||
        r.amountKd.toLowerCase().includes(needle)
      );
    });
  }, [rows, kindFilter, q]);

  const totalKd = useMemo(() => {
    if (!rows) return 0;
    return rows.reduce((acc, r) => acc + Number(r.amountKd), 0);
  }, [rows]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {t('myDocuments.title')}
          </h1>
          <p className="text-sm text-zinc-500">{t('myDocuments.subtitle')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden />
          )}
          {t('common.refresh', { defaultValue: 'تحديث' })}
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={FileText}
          title={t('myDocuments.summary.total')}
          value={String(rows?.length ?? 0)}
          tone="from-sky-50 to-sky-100 border-sky-200 text-sky-900"
        />
        <SummaryCard
          icon={HandCoins}
          title={t('myDocuments.summary.custody')}
          value={String(
            rows?.filter((r) => r.kind === 'CUSTODY_RECEIPT').length ?? 0,
          )}
          tone="from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-900"
        />
        <SummaryCard
          icon={Wallet}
          title={t('myDocuments.summary.expense')}
          value={String(
            rows?.filter((r) => r.kind === 'EXPENSE_VOUCHER').length ?? 0,
          )}
          tone="from-amber-50 to-amber-100 border-amber-200 text-amber-900"
        />
      </div>

      <Card className="rounded-[20px] border-border bg-card shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <CardTitle className="text-base font-semibold">
              {t('myDocuments.feed.title')}
            </CardTitle>
            <span className="text-xs text-zinc-500">
              {t('myDocuments.feed.count', { count: filtered.length })}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex rounded-lg border border-border bg-white p-0.5 text-xs font-medium">
              {(['ALL', 'CUSTODY_RECEIPT', 'EXPENSE_VOUCHER'] as const).map(
                (k) => (
                  <button
                    key={k}
                    type="button"
                    className={cn(
                      'rounded-md px-2.5 py-1 transition-colors',
                      kindFilter === k
                        ? 'bg-zinc-900 text-white'
                        : 'text-zinc-600 hover:bg-zinc-100',
                    )}
                    onClick={() => setKindFilter(k)}
                  >
                    {k === 'ALL'
                      ? t('myDocuments.filter.all')
                      : t(KIND_META[k].labelKey)}
                  </button>
                ),
              )}
            </div>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('myDocuments.filter.search')}
              className="w-full sm:w-60"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-zinc-500">
              {t('myDocuments.feed.empty')}
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {filtered.map((r) => {
                const meta = KIND_META[r.kind];
                const Icon = meta.icon;
                return (
                  <li
                    key={`${r.kind}:${r.id}`}
                    className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br',
                          meta.tone,
                        )}
                      >
                        <Icon className="h-5 w-5" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-zinc-900">
                            {r.title}
                          </span>
                          <Badge
                            variant="outline"
                            className={meta.badgeClass}
                          >
                            {t(meta.labelKey)}
                          </Badge>
                        </div>
                        {r.subtitle ? (
                          <div className="text-xs text-zinc-500">
                            {r.subtitle}
                          </div>
                        ) : null}
                        <div className="mt-1 text-xs text-zinc-400">
                          {new Date(r.date).toLocaleString(dateLocale)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      <span className="font-semibold tabular-nums text-zinc-900">
                        {formatKwdLabel(r.amountKd)}
                      </span>
                      <Link
                        to={r.printPath}
                        target="_blank"
                        className={cn(
                          buttonVariants({ variant: 'outline', size: 'sm' }),
                          'gap-2',
                        )}
                      >
                        <Printer className="h-4 w-4" aria-hidden />
                        {t('myDocuments.print')}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {rows && rows.length > 0 ? (
        <footer className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
          {t('myDocuments.footer.total', {
            count: rows.length,
            total: formatKwdLabel(totalKd.toFixed(3)),
          })}
        </footer>
      ) : null}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  title,
  value,
  tone,
}: {
  icon: typeof FileText;
  title: string;
  value: string;
  tone: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-gradient-to-br px-4 py-3 shadow-sm',
        tone,
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/70">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div>
        <div className="text-xs font-medium">{title}</div>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );
}
