import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { notify } from '@/lib/notify';
import { getWorkerLogs, STAGE_LABELS_AR, type WorkerLogs } from '../api';

/**
 * Worker productivity logs. Enter a worker user id to inspect their tasks,
 * average duration, and reported issues (branch-scoped for MANAGER).
 */
export function ProductionWorkersPage() {
  const { token } = useAuth();
  const [workerId, setWorkerId] = useState('');
  const [data, setData] = useState<WorkerLogs | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!token || !workerId.trim()) return;
    setLoading(true);
    try {
      setData(await getWorkerLogs(token, workerId.trim()));
    } catch (e) {
      notify.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <h1 className="text-xl font-semibold">أداء العمال</h1>
      <div className="flex gap-2">
        <input
          value={workerId}
          onChange={(e) => setWorkerId(e.target.value)}
          placeholder="معرّف العامل (User ID)"
          className="w-80 rounded-md border px-3 py-1.5 text-sm"
        />
        <button
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          عرض
        </button>
      </div>

      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-4">
              <div className="text-2xl font-bold">{data.totalTasks}</div>
              <div className="text-xs text-muted-foreground">مهام مكتملة</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-2xl font-bold">{data.avgDurationMinutes}</div>
              <div className="text-xs text-muted-foreground">متوسط المدة (دقيقة)</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-2xl font-bold">{data.issuesReported}</div>
              <div className="text-xs text-muted-foreground">بلاغات خلل</div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-right">
                <tr>
                  <th className="p-2">المرحلة</th>
                  <th className="p-2">الإجراء</th>
                  <th className="p-2">المدة (د)</th>
                  <th className="p-2">خلل</th>
                  <th className="p-2">التوقيت</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((l, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2">{STAGE_LABELS_AR[l.stage]}</td>
                    <td className="p-2">{l.action}</td>
                    <td className="p-2">{l.durationMinutes ?? '—'}</td>
                    <td className="p-2">{l.issueReported ? 'نعم' : '—'}</td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {new Date(l.at).toLocaleString('ar-KW')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
