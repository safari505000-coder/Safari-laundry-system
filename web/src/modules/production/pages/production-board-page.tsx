import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { notify } from '@/lib/notify';
import {
  getOwnerDashboard,
  getProductionBoard,
  STAGE_LABELS_AR,
  type OwnerDashboard,
  type ProductionBoard,
} from '../api';

/**
 * Manager Production Board (branch-scoped) + Owner cross-branch dashboard.
 * Read-only oversight: stage counts, delayed garments, open issues, active
 * workers, and (for OWNER/GM) per-branch bottlenecks + issue rates.
 */
export function ProductionBoardPage() {
  const { token, user } = useAuth();
  const isExec =
    user?.safariRole === 'OWNER' || user?.safariRole === 'GENERAL_MANAGER';

  const [board, setBoard] = useState<ProductionBoard | null>(null);
  const [owner, setOwner] = useState<OwnerDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const b = await getProductionBoard(token);
      setBoard(b);
      if (isExec) {
        setOwner(await getOwnerDashboard(token));
      }
    } catch (e) {
      notify.error(e);
    } finally {
      setLoading(false);
    }
  }, [token, isExec]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">جارٍ التحميل…</div>;
  }
  if (!board) {
    return <div className="p-6 text-sm text-muted-foreground">لا توجد بيانات إنتاج.</div>;
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">لوحة الإنتاج</h1>
        <button
          onClick={() => void load()}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          تحديث
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="قطع متأخرة" value={board.delayedGarments} danger />
        <Kpi label="مشاكل جودة مفتوحة" value={board.openIssues} danger={board.openIssues > 0} />
        <Kpi label="عمال نشطون" value={board.activeWorkers} />
        <Kpi label="بانتظار المرحلة التالية" value={board.waitingBetweenStages} />
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">عدد القطع في كل مرحلة</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
          {Object.entries(STAGE_LABELS_AR).map(([stage, label]) => (
            <div key={stage} className="rounded-md border p-3 text-center">
              <div className="text-lg font-semibold">{board.countsByStage[stage] ?? 0}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {board.delayedList.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">قطع متأخرة</h2>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-right">
                <tr>
                  <th className="p-2">القطعة</th>
                  <th className="p-2">المرحلة</th>
                  <th className="p-2">الخدمة</th>
                  <th className="p-2">تأخير (د)</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {board.delayedList.map((t) => (
                  <tr key={t.garmentId} className="border-t">
                    <td className="p-2">{t.label ?? t.garmentId.slice(0, 8)}</td>
                    <td className="p-2">{STAGE_LABELS_AR[t.stage]}</td>
                    <td className="p-2">{t.serviceType === 'EXPRESS' ? 'مستعجل' : 'عادي'}</td>
                    <td className="p-2 text-red-600">{t.delayMinutes}</td>
                    <td className="p-2">
                      <Link
                        className="text-blue-600 hover:underline"
                        to={`/production/garments/${t.garmentId}`}
                      >
                        التفاصيل
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isExec && owner && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">لوحة المالك — كل الفروع</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="تأخيرات التسليم" value={owner.delayedHandoffs} danger />
            <Kpi label="قطع تالفة" value={owner.damagedCount} danger={owner.damagedCount > 0} />
            <Kpi label="قطع مفقودة" value={owner.lostCount} danger={owner.lostCount > 0} />
            <Kpi label="عدد الفروع" value={Object.keys(owner.branches).length} />
          </div>
          {owner.bottlenecks.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs text-muted-foreground">الاختناقات حسب المرحلة</h3>
              <div className="flex flex-wrap gap-2">
                {owner.bottlenecks.map((b) => (
                  <span key={b.stage} className="rounded-full border px-3 py-1 text-xs">
                    {STAGE_LABELS_AR[b.stage as keyof typeof STAGE_LABELS_AR] ?? b.stage}: {b.waiting}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-lg border p-4">
      <div className={`text-2xl font-bold ${danger ? 'text-red-600' : ''}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
