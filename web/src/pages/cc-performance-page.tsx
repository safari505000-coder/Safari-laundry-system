import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { Loader2, RefreshCw, Trophy, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  getCcPerformance,
  ApiError,
  type CcPerformanceResponse,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * V19.9 — Per-agent Call-Center performance leaderboard.
 *
 * Visible to OWNER, GENERAL_MANAGER, and CALL_CENTER_SUPERVISOR. The
 * supervisor uses it to coach their own team; the OWNER/GM dashboards
 * it as a daily signal next to the debt-recovery report. All numbers
 * come from the single ledger (TransactionHistory) so there is no
 * double-counting against the Call Center daily feed.
 */
export function CcPerformancePage() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const allowed = can(user, 'ccPerformance.view');

  const today = useMemo(() => isoDay(new Date()), []);
  const [fromIso, setFromIso] = useState(today);
  const [toIso, setToIso] = useState(today);
  const [data, setData] = useState<CcPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token || !allowed) return;
      if (!opts?.silent) setLoading(true);
      try {
        const res = await getCcPerformance(token, {
          from: fromIso,
          to: toIso,
        });
        setData(res);
      } catch (e) {
        const msg =
          e instanceof ApiError
            ? e.message
            : 'تعذر تحميل تقرير أداء الكول سنتر';
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [token, allowed, fromIso, toIso],
  );

  useEffect(() => {
    void load({ silent: true });
  }, [load]);

  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Trophy className="h-6 w-6 text-yellow-500" />
            {t('nav.ccPerformance')}
          </h1>
          <p className="text-sm text-muted-foreground">
            أداء كل موظف كول سنتر خلال الفترة المحددة
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="from">من</Label>
            <Input
              id="from"
              type="date"
              value={fromIso}
              onChange={(e) => setFromIso(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="to">إلى</Label>
            <Input
              id="to"
              type="date"
              value={toIso}
              onChange={(e) => setToIso(e.target.value)}
              className="w-40"
            />
          </div>
          <Button onClick={() => load()} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            تحديث
          </Button>
        </div>
      </header>

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard
              label="إجمالي التحصيل"
              value={formatKwdLabel(data.totals.collectedKd)}
              tone="green"
            />
            <KpiCard
              label="مديونية تم سدادها"
              value={formatKwdLabel(data.totals.debtSettledKd)}
              tone="blue"
            />
            <KpiCard
              label="اشتراكات مفعّلة"
              value={String(data.totals.activationsCount)}
              tone="purple"
            />
            <KpiCard
              label="عملاء تمت خدمتهم"
              value={String(data.totals.customersServed)}
              tone="orange"
            />
          </div>

          <section className="rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">
                المتصدرون ({data.agents.length})
              </h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>الموظف</TableHead>
                  <TableHead>الرتبة</TableHead>
                  <TableHead className="text-right">التحصيل</TableHead>
                  <TableHead className="text-right">
                    مديونية مسددة
                  </TableHead>
                  <TableHead className="text-right">تفعيلات</TableHead>
                  <TableHead className="text-right">عملاء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.agents.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-10 text-center text-muted-foreground"
                    >
                      لا توجد حركات لهذه الفترة
                    </TableCell>
                  </TableRow>
                ) : (
                  data.agents.map((a, i) => (
                    <TableRow key={a.agentId}>
                      <TableCell className="text-center font-bold">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-medium">
                        {a.agentName}
                      </TableCell>
                      <TableCell>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                          {a.role === 'CALL_CENTER_SUPERVISOR'
                            ? 'مسؤول كول سنتر'
                            : 'كول سنتر'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {formatKwdLabel(a.collectedKd)}
                      </TableCell>
                      <TableCell className="text-right text-blue-600">
                        {formatKwdLabel(a.debtSettledKd)}
                      </TableCell>
                      <TableCell className="text-right">
                        {a.activationsCount}
                      </TableCell>
                      <TableCell className="text-right">
                        {a.customersServed}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </section>
        </>
      ) : (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'green' | 'blue' | 'purple' | 'orange';
}) {
  const toneMap = {
    green: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
    purple:
      'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300',
    orange:
      'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300',
  };
  return (
    <div
      className={`rounded-xl border border-border p-4 shadow-sm ${toneMap[tone]}`}
    >
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
