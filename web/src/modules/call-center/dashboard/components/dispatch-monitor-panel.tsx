import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Truck } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  fetchDispatchMonitor,
  type DispatchMonitorSnapshot,
  type DispatchRow,
} from '../api/cc-dashboard-api';

function slaBadgeClass(tone: DispatchRow['slaTone']): string {
  if (tone === 'BREACH') return 'border-red-300 bg-red-50 text-red-900';
  if (tone === 'LATE') return 'border-amber-300 bg-amber-50 text-amber-950';
  return 'border-emerald-200 bg-emerald-50 text-emerald-950';
}

const EMPTY_COPY = 'لا توجد مهام حالياً';

export function DispatchMonitorPanel() {
  const { token } = useAuth();
  const [snap, setSnap] = useState<DispatchMonitorSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const firstFetchRef = useRef(true);
  const escalatedSeenRef = useRef(new Set<string>());
  const monitorAbortRef = useRef<AbortController | null>(null);
  const fetchGenerationRef = useRef(0);

  useEffect(() => {
    if (!token) {
      setSnap(null);
      setLoading(false);
      firstFetchRef.current = true;
      return;
    }
    let cancelled = false;

    const tick = async () => {
      monitorAbortRef.current?.abort();
      const ctrl = new AbortController();
      monitorAbortRef.current = ctrl;
      const gen = ++fetchGenerationRef.current;
      const isFirst = firstFetchRef.current;
      if (isFirst) setLoading(true);
      try {
        const next = await fetchDispatchMonitor(token, {
          signal: ctrl.signal,
        });
        if (
          cancelled ||
          ctrl.signal.aborted ||
          gen !== fetchGenerationRef.current
        )
          return;
        setSnap(next);
        for (const row of next.delayedDriversSection) {
          if (
            row.escalatedAtIso &&
            !escalatedSeenRef.current.has(`${row.id}:${row.escalatedAtIso}`)
          ) {
            escalatedSeenRef.current.add(`${row.id}:${row.escalatedAtIso}`);
            toast.warning('تصعيد مهمة — تأخّر في الاستجابة', {
              description: `${row.customerDisplay} · ${row.driverName}`,
              duration: 12_000,
            });
          }
        }
      } catch {
        if (
          !cancelled &&
          !ctrl.signal.aborted &&
          gen === fetchGenerationRef.current
        ) {
          setSnap(null);
        }
      } finally {
        if (
          !cancelled &&
          !ctrl.signal.aborted &&
          isFirst &&
          gen === fetchGenerationRef.current
        ) {
          firstFetchRef.current = false;
          setLoading(false);
        }
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 15_000);
    return () => {
      cancelled = true;
      monitorAbortRef.current?.abort();
      monitorAbortRef.current = null;
      window.clearInterval(id);
    };
  }, [token]);

  if (!token) return null;

  const showGrid =
    snap &&
    (snap.drivers.length > 0 || snap.delayedDriversSection.length > 0);

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Truck className="size-5 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold">مراقبة السائقين (مهام نشطة)</h2>
      </div>
      <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
        يُعرض هنا فقط إسناد مركز الاتصال النشط حديثاً (حالة ASSIGNED، من يوم
        العمل الحالي في الكويت، وخلال آخر نحو ٤ ساعات): مهام أنشأها وكيل أو
        مشرف كول سنتر، وليس من النظام أو الإدارة الأخرى.
      </p>
      <p className="mb-4 text-xs text-muted-foreground">
        تحديث كل ~١٥ ثانية · الأخضر طبيعي · الأصفر تأخّر · الأحمر تجاوز حرج
      </p>

      {loading && !snap ?
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          جاري التحميل…
        </div>
      : !showGrid ?
        <p className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
          {EMPTY_COPY}
        </p>
      : <>
          <div className="grid gap-3 sm:grid-cols-2">
            {snap.drivers.map((d) => (
              <div
                key={d.driverId}
                className={`rounded-lg border px-3 py-2 text-xs ${slaBadgeClass(
                  d.breachCount > 0 ?
                    'BREACH'
                  : d.lateCount > 0 ?
                    'LATE'
                  : 'NORMAL',
                )}`}
              >
                <div className="flex items-center justify-between gap-2 font-medium">
                  <span className="truncate">{d.driverName}</span>
                  <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold tabular-nums">
                    {d.activeAssignedCount} مهمة
                  </span>
                </div>
                <div className="mt-1 flex gap-3 text-[11px] opacity-90">
                  <span>متأخرة: {d.lateCount}</span>
                  <span>تجاوز: {d.breachCount}</span>
                </div>
              </div>
            ))}
          </div>

          {snap.delayedDriversSection.length > 0 ?
            <div className="mt-5 border-t border-border pt-4">
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
                مهام تحتاج متابعة (تصعيد SLA بعد ٥ دقائق أو تجاوز)
              </h3>
              <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
                {snap.delayedDriversSection.map((row) => (
                  <li
                    key={row.id}
                    className={`flex flex-col gap-0.5 rounded-md border px-2 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${slaBadgeClass(row.slaTone)}`}
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{row.customerDisplay}</span>
                      {row.customerPhone ?
                        <span
                          className="ms-2 text-[10px] tabular-nums text-muted-foreground"
                          dir="ltr"
                        >
                          {row.customerPhone}
                        </span>
                      : null}
                    </div>
                    <span className="text-[11px] opacity-80">
                      {row.driverName} · {row.elapsedMinutes} د
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          : null}
        </>
      }
    </section>
  );
}
