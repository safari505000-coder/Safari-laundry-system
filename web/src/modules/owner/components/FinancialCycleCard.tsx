import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ApiError,
  type RecentShiftCycleRow,
  type ShiftCycleSnapshot,
  getCurrentShiftCycle,
  getRecentShiftCycles,
  runShiftCycleNow,
} from '@/lib/api';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';
import { can } from '@/modules/shared/auth/access-matrix';
import { useAuth } from '@/contexts/auth-context';

type Props = {
  token: string | null;
};

const kwFormatter = new Intl.DateTimeFormat('ar-KW', {
  timeZone: 'Asia/Kuwait',
  dateStyle: 'medium',
  timeStyle: 'short',
});

const kwDate = new Intl.DateTimeFormat('ar-KW', {
  timeZone: 'Asia/Kuwait',
  dateStyle: 'medium',
});

function formatKuwait(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return kwFormatter.format(d);
}

function formatKuwaitDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return kwDate.format(d);
}

function useCountdown(targetIso: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return useMemo(() => {
    if (!targetIso) return '—';
    const diff = new Date(targetIso).getTime() - now;
    if (!Number.isFinite(diff)) return '—';
    if (diff <= 0) return '00:00:00';
    const totalSec = Math.floor(diff / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }, [targetIso, now]);
}

/**
 * DUSTUR §2 — System Control Panel widget for the OWNER dashboard.
 *
 * Shows the current Kuwait-midnight financial cycle, driver coverage, and the
 * last 7 cycles. Exposes the OWNER-only "run cycle now" override.
 */
export function FinancialCycleCard({ token }: Props) {
  const { user } = useAuth();
  const canRunNow = can(user, 'shiftCycle.runNow');
  const [snapshot, setSnapshot] = useState<ShiftCycleSnapshot | null>(null);
  const [recent, setRecent] = useState<RecentShiftCycleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [snap, list] = await Promise.all([
        getCurrentShiftCycle(token),
        getRecentShiftCycles(token, 7),
      ]);
      setSnapshot(snap);
      setRecent(list);
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.message);
      } else {
        toast.error('تعذر تحميل بيانات الدورة المالية');
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const countdown = useCountdown(snapshot?.nextCycleAt ?? null);

  const handleRunNow = useCallback(async () => {
    if (!token) return;
    setRunning(true);
    try {
      const result = await runShiftCycleNow(token);
      toast.success(
        `تم تشغيل الدورة يدوياً — أُغلق ${result.closed} شفت، فُتح ${result.opened} شفت`,
      );
      await refresh();
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.message);
      } else {
        toast.error('فشل تشغيل الدورة يدوياً');
      }
    } finally {
      setRunning(false);
    }
  }, [token, refresh]);

  const coverage = snapshot
    ? `${snapshot.driversOnShift} / ${snapshot.activeDriversTotal}`
    : '—';

  return (
    <Card className="border-slate-300 bg-white shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-lg font-bold text-slate-950">
          الدورة المالية (12:00 — 12:00 بتوقيت الكويت)
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={refresh}
            disabled={loading}
          >
            تحديث
          </Button>
          {canRunNow && (
            <Button
              type="button"
              onClick={handleRunNow}
              disabled={running || !token}
            >
              {running ? 'جارٍ التشغيل…' : 'تشغيل الدورة الآن'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="بداية الدورة الحالية"
            value={formatKuwait(snapshot?.cycleStartAt)}
          />
          <StatTile
            label="نهاية الدورة الحالية"
            value={formatKuwait(snapshot?.cycleEndAt)}
          />
          <StatTile
            label="العد التنازلي للدورة التالية"
            value={countdown}
            mono
          />
          <StatTile
            label="سواق مفتوحة شفتاتهم / الإجمالي النشط"
            value={coverage}
            highlight={
              snapshot
                ? snapshot.driversOnShift < snapshot.activeDriversTotal
                : false
            }
          />
        </div>

        {snapshot && snapshot.staleOpenShifts > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            يوجد {snapshot.staleOpenShifts} شفت مفتوح من دورة سابقة لم يُغلق.
            اضغط "تشغيل الدورة الآن" لإغلاقها يدوياً.
          </div>
        )}

        <div>
          <h3 className="mb-2 text-sm font-bold text-slate-950">
            آخر 7 دورات
          </h3>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-100/90 hover:bg-slate-100/90">
                  <TableHead className="font-bold text-slate-950">
                    التاريخ
                  </TableHead>
                  <TableHead className="font-bold text-slate-950">
                    شفتات مفتوحة
                  </TableHead>
                  <TableHead className="font-bold text-slate-950">
                    شفتات مغلقة
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((row) => (
                  <TableRow key={row.cycleStartAt}>
                    <TableCell className="font-semibold text-slate-900">
                      {formatKuwaitDate(row.cycleStartAt)}
                    </TableCell>
                    <TableCell className="text-slate-800">
                      {row.shiftsOpened}
                    </TableCell>
                    <TableCell className="text-slate-800">
                      {row.shiftsClosed}
                    </TableCell>
                  </TableRow>
                ))}
                {recent.length === 0 && !loading && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-slate-600"
                    >
                      لا توجد بيانات لعرضها
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatTile({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        highlight
          ? 'border-amber-300 bg-amber-50'
          : 'border-slate-200 bg-slate-50'
      }`}
    >
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div
        className={`mt-1 text-base font-bold text-slate-950 ${
          mono ? 'font-mono' : ''
        }`}
      >
        {value}
      </div>
    </div>
  );
}
