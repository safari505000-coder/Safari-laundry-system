import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { notify } from '@/lib/notify';
import {
  listWorkerTasks,
  STAGE_LABELS_AR,
  workerAccept,
  workerComplete,
  workerReportIssue,
  workerStart,
  type ProductionTask,
} from '../api';

/**
 * Worker task list. NOTE: WORKER is not a web-admin login role — the
 * primary worker experience is the employee-mobile app (/worker/tasks).
 * This screen mirrors that flow for OWNER support/preview and uses the
 * same `/api/worker/tasks` endpoints.
 */
export function WorkerTasksPage() {
  const { token } = useAuth();
  const [tasks, setTasks] = useState<ProductionTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setTasks(await listWorkerTasks(token));
    } catch (e) {
      notify.error(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
      await load();
    } catch (e) {
      notify.error(e);
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">جارٍ التحميل…</div>;
  }

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">مهام العامل</h1>
        <button onClick={() => void load()} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          تحديث
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="text-sm text-muted-foreground">لا توجد مهام حالياً.</div>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <div key={t.garmentId} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">
                    {STAGE_LABELS_AR[t.stage]} — {t.label ?? t.garmentId.slice(0, 8)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    طلب {t.orderId.slice(0, 8)} · {t.serviceType === 'EXPRESS' ? 'مستعجل' : 'عادي'} ·{' '}
                    {t.pieceCount} قطعة · الحالة: {t.taskStatus}
                    {t.isLate && <span className="text-red-600"> · متأخرة</span>}
                  </div>
                  {t.internalNote && (
                    <div className="mt-1 text-xs text-muted-foreground">ملاحظة: {t.internalNote}</div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {t.taskStatus === 'WAITING_NEXT_STAGE' && (
                    <Btn busy={busy === t.garmentId} onClick={() => act(t.garmentId, () => workerAccept(token!, t.garmentId))}>
                      قبول
                    </Btn>
                  )}
                  {t.taskStatus === 'ACCEPTED_BY_WORKER' && (
                    <Btn busy={busy === t.garmentId} onClick={() => act(t.garmentId, () => workerStart(token!, t.garmentId))}>
                      بدء
                    </Btn>
                  )}
                  {t.taskStatus === 'IN_PROGRESS' && (
                    <>
                      <Btn busy={busy === t.garmentId} onClick={() => act(t.garmentId, () => workerComplete(token!, t.garmentId))}>
                        إنهاء
                      </Btn>
                      <Btn
                        busy={busy === t.garmentId}
                        danger
                        onClick={() =>
                          act(t.garmentId, () =>
                            workerReportIssue(token!, t.garmentId, { issueType: 'OTHER' }),
                          )
                        }
                      >
                        إبلاغ عن خلل
                      </Btn>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Btn({
  children,
  onClick,
  busy,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      disabled={busy}
      onClick={onClick}
      className={`rounded-md border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50 ${
        danger ? 'border-red-300 text-red-600' : ''
      }`}
    >
      {children}
    </button>
  );
}
