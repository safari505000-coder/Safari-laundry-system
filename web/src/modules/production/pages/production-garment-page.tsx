import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { notify } from '@/lib/notify';
import {
  getGarmentTimeline,
  ISSUE_LABELS_AR,
  STAGE_LABELS_AR,
  type GarmentTimeline,
} from '../api';

const ACTION_LABELS_AR: Record<string, string> = {
  ACCEPTED: 'قُبلت',
  STARTED: 'بدأت',
  COMPLETED: 'اكتملت',
  HANDED_OFF: 'سُلّمت',
  DELAYED: 'تأخرت',
  ISSUE_REPORTED: 'بلاغ خلل',
  DECISION_MADE: 'قرار',
  REWORK_SENT: 'إعادة عمل',
  READY_MARKED: 'وُسمت كجاهز',
};

/** Append-only garment timeline + its issues / decisions. */
export function ProductionGarmentPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [data, setData] = useState<GarmentTimeline | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    try {
      setData(await getGarmentTimeline(token, id));
    } catch (e) {
      notify.error(e);
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">جارٍ التحميل…</div>;
  }
  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">لا توجد بيانات.</div>;
  }

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div>
        <h1 className="text-xl font-semibold">
          سجل القطعة — {data.garment.label ?? data.garment.garmentId.slice(0, 8)}
        </h1>
        <div className="text-sm text-muted-foreground">
          المرحلة الحالية: {STAGE_LABELS_AR[data.garment.stage]} ·
          {data.garment.hasOpenIssue ? ' يوجد خلل مفتوح' : ' لا يوجد خلل مفتوح'}
        </div>
      </div>

      {data.issues.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">المشاكل</h2>
          <div className="space-y-2">
            {data.issues.map((i) => (
              <div key={i.id} className="rounded-md border p-3 text-sm">
                {ISSUE_LABELS_AR[i.issueType]} — {i.status} ({STAGE_LABELS_AR[i.stage]})
                {i.notes && <div className="text-muted-foreground">{i.notes}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">الخط الزمني (سجل دائم)</h2>
        <ol className="relative space-y-3 border-r pr-4">
          {data.timeline.map((e, idx) => (
            <li key={idx} className="text-sm">
              <span className="font-medium">{ACTION_LABELS_AR[e.action] ?? e.action}</span>
              {' — '}
              {e.fromStage ? `${STAGE_LABELS_AR[e.fromStage]} → ` : ''}
              {STAGE_LABELS_AR[e.toStage]}
              <span className="block text-xs text-muted-foreground">
                {new Date(e.at).toLocaleString('ar-KW')}
                {e.notes ? ` · ${e.notes}` : ''}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
