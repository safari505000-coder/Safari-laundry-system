import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  ApiError,
  type SerialGapLatest,
  getLatestSerialGapReport,
  scanSerialGapsNow,
} from '@/lib/api';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { useAuth } from '@/contexts/auth-context';

type Props = {
  token: string | null;
};

const kwFormatter = new Intl.DateTimeFormat('ar-KW', {
  timeZone: 'Asia/Kuwait',
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * Dastur §3.8 — surface for the daily order-serial gap monitor.
 *
 * Shows the most recent audited scan (clean or with gaps) and lets the
 * OWNER run an ad-hoc scan. Stays minimal on purpose: the heavy lifting
 * is the cron at 00:05 Kuwait; this card is a verification window.
 */
export function SerialGapCard({ token }: Props) {
  const { hasRole } = useAuth();
  const [data, setData] = useState<SerialGapLatest['latest']>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await getLatestSerialGapReport(token);
      setData(res.latest);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const canScan = hasRole('OWNER');

  async function onScanNow() {
    if (!token) return;
    setScanning(true);
    try {
      await scanSerialGapsNow(token);
      await load();
      toast.success('تم فحص التسلسل');
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setScanning(false);
    }
  }

  const report = data?.report;
  const badgeClass =
    data == null ?
      'bg-muted text-muted-foreground'
    : data.hadGaps ?
      'bg-rose-100 text-rose-900'
    : 'bg-emerald-100 text-emerald-900';
  const badgeLabel =
    data == null ?
      'لم يُنفّذ الفحص بعد'
    : data.hadGaps ?
      `${report?.gapCount ?? 0} فجوة مرصودة`
    : 'تسلسل سليم';

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base font-bold text-foreground">
            مراقبة تسلسل الفواتير
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            فحص يومي تلقائي 00:05 بتوقيت الكويت. أي فجوة = فاتورة محذوفة من
            قاعدة البيانات وتستوجب تحقيقاً.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}
          >
            {badgeLabel}
          </span>
          {canScan ?
            <Button
              size="sm"
              variant="outline"
              onClick={() => void onScanNow()}
              disabled={scanning || loading}
            >
              {scanning ? 'جاري الفحص…' : 'فحص الآن'}
            </Button>
          : null}
        </div>
      </CardHeader>
      <CardContent className="text-sm text-foreground">
        {loading ?
          <p className="text-muted-foreground">جاري التحميل…</p>
        : data == null ?
          <p className="text-muted-foreground">
            لم يتم توثيق أي فحص حتى الآن. سيبدأ الفحص التلقائي في 00:05 بتوقيت
            الكويت، أو اضغط "فحص الآن" لتشغيله يدوياً.
          </p>
        : <div className="space-y-2">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">آخر فحص</dt>
                <dd className="font-semibold tabular-nums">
                  {kwFormatter.format(new Date(data.recordedAtIso))}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">العدّاد الحالي</dt>
                <dd className="font-semibold tabular-nums">
                  {report?.currentCounter ?? 0}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">الفواتير المسجّلة</dt>
                <dd className="font-semibold tabular-nums">
                  {report?.presentCount ?? 0}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">الفجوات</dt>
                <dd className="font-semibold tabular-nums">
                  {report?.gapCount ?? 0}
                </dd>
              </div>
            </dl>
            {data.hadGaps && report && report.firstGaps.length > 0 ?
              <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-900">
                <p className="font-semibold">
                  أول {report.firstGaps.length} رقم مفقود
                  {report.allGapsTruncated ? ' (قائمة مقتطعة)' : ''}:
                </p>
                <p className="mt-1 font-mono tabular-nums leading-relaxed">
                  {report.firstGaps.join('، ')}
                </p>
              </div>
            : null}
          </div>
        }
      </CardContent>
    </Card>
  );
}
