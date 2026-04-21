import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ApiError,
  getLowStockLatestSnapshot,
  type LowStockResponse,
} from '@/lib/api';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';

type Props = {
  token: string | null;
};

const kwFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kuwait',
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * Dastur §4 inventory supervision — surface for the 06:00 Kuwait low-stock
 * cron. Mirrors the SerialGapCard skeleton: shows the latest persisted
 * snapshot (which is the single source of truth for "are we running out
 * of anything"), plus a deep-link into the full inventory report.
 */
export function LowStockCard({ token }: Props) {
  const [snapshot, setSnapshot] = useState<{
    hadAlerts: boolean;
    recordedAtIso: string;
    report: LowStockResponse;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await getLowStockLatestSnapshot(token);
      setSnapshot(res);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const hadAlerts = snapshot?.hadAlerts ?? false;
  const summary = snapshot?.report.summary;
  const rows = snapshot?.report.rows ?? [];
  const badgeClass =
    snapshot == null
      ? 'bg-muted text-muted-foreground'
      : hadAlerts
        ? 'bg-rose-100 text-rose-900'
        : 'bg-emerald-100 text-emerald-900';
  const badgeLabel =
    snapshot == null
      ? 'لم يُنفّذ الفحص بعد'
      : hadAlerts
        ? `${summary?.total ?? 0} أصناف تحت الحد`
        : 'المخزون سليم';

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base font-bold text-foreground">
            تنبيهات المخزون المنخفض
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            فحص يومي تلقائي 06:00 بتوقيت الكويت لكل فرع/صنف يقع عند أو تحت
            نقطة إعادة الطلب.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>
            {badgeLabel}
          </span>
          <Link to="/inventory/low-stock">
            <Button size="sm" variant="outline">
              التفاصيل
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-foreground">
        {loading ? (
          <p className="text-muted-foreground">جاري التحميل…</p>
        ) : snapshot == null ? (
          <p className="text-muted-foreground">
            لم يتم توثيق أي فحص حتى الآن. سيبدأ الفحص التلقائي في 06:00
            بتوقيت الكويت.
          </p>
        ) : (
          <div className="space-y-2">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">آخر فحص</dt>
                <dd className="font-semibold tabular-nums">
                  {kwFormatter.format(new Date(snapshot.recordedAtIso))}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">نفذ من المخزون</dt>
                <dd className="font-semibold tabular-nums text-rose-700">
                  {summary?.outOfStock ?? 0}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">منخفض</dt>
                <dd className="font-semibold tabular-nums text-amber-700">
                  {summary?.lowStock ?? 0}
                </dd>
              </div>
            </dl>
            {hadAlerts && rows.length > 0 ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-900">
                <p className="font-semibold">أبرز الأصناف:</p>
                <ul className="mt-1 space-y-0.5">
                  {rows.slice(0, 5).map((r) => (
                    <li key={`${r.stockItemId}-${r.branchId}`} className="flex justify-between gap-2">
                      <span className="truncate">
                        {r.nameAr} · {r.branchName}
                      </span>
                      <span className="tabular-nums">
                        {r.quantityOnHand} / {r.reorderPoint}
                      </span>
                    </li>
                  ))}
                </ul>
                {rows.length > 5 ? (
                  <p className="mt-1 text-[11px] text-rose-700">
                    +{rows.length - 5} صنف آخر
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
