import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import { notify } from '@/lib/notify';
import {
  decideIssue,
  ISSUE_LABELS_AR,
  listProductionIssues,
  STAGE_LABELS_AR,
  type GarmentIssue,
  type ProductionDecisionType,
} from '../api';

const DECISIONS: Array<{ value: ProductionDecisionType; label: string }> = [
  { value: 'REWASH', label: 'إعادة غسيل' },
  { value: 'REIRON', label: 'إعادة كي' },
  { value: 'REPAIR', label: 'إصلاح' },
  { value: 'APPROVE_AS_READY', label: 'اعتماد كجاهز' },
  { value: 'ESCALATE_TO_OWNER', label: 'تصعيد للمالك' },
  { value: 'MARK_DAMAGED', label: 'وسم كتالف' },
  { value: 'MARK_LOST', label: 'وسم كمفقود' },
];

/** Quality issues queue with manager / owner decision actions. */
export function ProductionIssuesPage() {
  const { token, user } = useAuth();
  const canDecide = can(user, 'production.manage');

  const [issues, setIssues] = useState<GarmentIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setIssues(await listProductionIssues(token));
    } catch (e) {
      notify.error(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (issueId: string, decision: ProductionDecisionType) => {
    if (!token) return;
    setBusyId(issueId);
    try {
      await decideIssue(token, issueId, { decision });
      notify.success('تم تسجيل القرار');
      await load();
    } catch (e) {
      notify.error(e);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">جارٍ التحميل…</div>;
  }

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">مشاكل الجودة</h1>
        <button onClick={() => void load()} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          تحديث
        </button>
      </div>

      {issues.length === 0 ? (
        <div className="text-sm text-muted-foreground">لا توجد مشاكل مفتوحة.</div>
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => (
            <div key={issue.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">
                    {ISSUE_LABELS_AR[issue.issueType]} —{' '}
                    {issue.garment?.label ?? issue.garmentId.slice(0, 8)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    المرحلة: {STAGE_LABELS_AR[issue.stage]} · الحالة: {issue.status}
                  </div>
                  {issue.notes && <div className="mt-1 text-sm">{issue.notes}</div>}
                </div>
                <Link
                  className="text-sm text-blue-600 hover:underline"
                  to={`/production/garments/${issue.garmentId}`}
                >
                  سجل القطعة
                </Link>
              </div>

              {canDecide && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {DECISIONS.map((d) => (
                    <button
                      key={d.value}
                      disabled={busyId === issue.id}
                      onClick={() => void decide(issue.id, d.value)}
                      className="rounded-md border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50"
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
