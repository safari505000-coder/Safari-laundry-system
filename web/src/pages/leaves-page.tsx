import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  CheckCircle2,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { notify } from '@/lib/notify';
import {
  approveLeave,
  cancelLeave,
  createLeave,
  listLeaves,
  listMyLeaves,
  rejectLeave,
  type LeaveFilters,
  type LeaveRow,
  type LeaveStatus,
  type LeaveType,
} from '@/lib/api';
import { can } from '@/modules/shared/auth/access-matrix';
import { TableBodySkeleton } from '@/modules/shared/components/ui/skeleton-helpers';
import { Badge } from '@/modules/shared/components/ui/badge';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/shared/components/ui/dialog';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import { Textarea } from '@/modules/shared/components/ui/textarea';

/**
 * Stage-D — unified leave requests page. Approvers (OWNER / GM /
 * MANAGER / ACCOUNTANT) see the full queue with approve/reject
 * actions; all other roles only see their own submissions. Everyone
 * can submit a new request and print the A4 form.
 */

const TYPE_LABEL: Record<LeaveType, string> = {
  ANNUAL: 'سنوية',
  SICK: 'مرضية',
  UNPAID: 'بدون راتب',
  EMERGENCY: 'طارئة',
};

const STATUS_TONE: Record<LeaveStatus, string> = {
  PENDING: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  APPROVED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  REJECTED: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  CANCELLED: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

const STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: 'بانتظار الاعتماد',
  APPROVED: 'معتمدة',
  REJECTED: 'مرفوضة',
  CANCELLED: 'ملغاة',
};

export function LeavesPage() {
  const { user, token } = useAuth();
  const isApprover = can(user, 'hr.leaves.approve');

  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<LeaveFilters>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    type: 'ANNUAL' as LeaveType,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    reason: '',
  });
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<LeaveRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = isApprover
        ? await listLeaves(token, filters)
        : await listMyLeaves(token);
      setRows(data);
    } catch (e) {
      notify.error(e, { fallback: 'فشل تحميل الإجازات' });
    } finally {
      setLoading(false);
    }
  }, [token, isApprover, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const s = { pending: 0, approved: 0, days: 0 };
    for (const r of rows) {
      if (r.status === 'PENDING') s.pending += 1;
      if (r.status === 'APPROVED') {
        s.approved += 1;
        s.days += r.daysCount;
      }
    }
    return s;
  }, [rows]);

  const onCreate = useCallback(async () => {
    if (!token) return;
    setSaving(true);
    try {
      await createLeave(token, {
        type: form.type,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason || undefined,
      });
      notify.success('تم إنشاء الطلب');
      setCreateOpen(false);
      setForm((f) => ({ ...f, reason: '' }));
      await load();
    } catch (e) {
      notify.error(e, { fallback: 'فشل إنشاء الطلب' });
    } finally {
      setSaving(false);
    }
  }, [token, form, load]);

  const onApprove = useCallback(
    async (id: string) => {
      if (!token) return;
      setActionBusy(id);
      try {
        await approveLeave(token, id);
        notify.success('تم اعتماد الطلب');
        await load();
      } catch (e) {
        notify.error(e, { fallback: 'فشل الاعتماد' });
      } finally {
        setActionBusy(null);
      }
    },
    [token, load],
  );

  const onReject = useCallback(async () => {
    if (!token || !rejectFor) return;
    if (!rejectReason.trim()) {
      notify.error('سبب الرفض مطلوب');
      return;
    }
    setActionBusy(rejectFor.id);
    try {
      await rejectLeave(token, rejectFor.id, rejectReason.trim());
      notify.success('تم رفض الطلب');
      setRejectFor(null);
      setRejectReason('');
      await load();
    } catch (e) {
      notify.error(e, { fallback: 'فشل الرفض' });
    } finally {
      setActionBusy(null);
    }
  }, [token, rejectFor, rejectReason, load]);

  const onCancel = useCallback(
    async (id: string) => {
      if (!token) return;
      setActionBusy(id);
      try {
        await cancelLeave(token, id);
        notify.success('تم إلغاء الطلب');
        await load();
      } catch (e) {
        notify.error(e, { fallback: 'فشل الإلغاء' });
      } finally {
        setActionBusy(null);
      }
    },
    [token, load],
  );

  return (
    <div className="space-y-6 p-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-50">
            <CalendarDays className="h-6 w-6 text-emerald-400" />
            إدارة الإجازات
          </h1>
          <p className="text-sm text-slate-400">
            {isApprover
              ? 'طلبات الإجازات المعتمدة / المعلقة / المرفوضة لجميع الموظفين.'
              : 'طلباتك الشخصية — أنشئ طلباً جديداً وتتبّع حالته.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw
              className={`ms-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            />
            تحديث
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="ms-1 h-4 w-4" />
            طلب جديد
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="بانتظار الاعتماد" value={summary.pending.toString()} />
        <Stat label="معتمدة" value={summary.approved.toString()} />
        <Stat label="إجمالي أيام الإجازة" value={summary.days.toString()} />
      </div>

      {isApprover ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الفلاتر</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div>
              <Label className="text-xs">الحالة</Label>
              <Select
                value={filters.status ?? 'ALL'}
                onValueChange={(v) =>
                  setFilters((f) => ({
                    ...f,
                    status:
                      !v || v === 'ALL' ? undefined : (v as LeaveStatus),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">الكل</SelectItem>
                  <SelectItem value="PENDING">بانتظار</SelectItem>
                  <SelectItem value="APPROVED">معتمدة</SelectItem>
                  <SelectItem value="REJECTED">مرفوضة</SelectItem>
                  <SelectItem value="CANCELLED">ملغاة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">النوع</Label>
              <Select
                value={filters.type ?? 'ALL'}
                onValueChange={(v) =>
                  setFilters((f) => ({
                    ...f,
                    type:
                      !v || v === 'ALL' ? undefined : (v as LeaveType),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">الكل</SelectItem>
                  <SelectItem value="ANNUAL">سنوية</SelectItem>
                  <SelectItem value="SICK">مرضية</SelectItem>
                  <SelectItem value="UNPAID">بدون راتب</SelectItem>
                  <SelectItem value="EMERGENCY">طارئة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">من تاريخ</Label>
              <Input
                type="date"
                value={filters.from ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    from: e.target.value || undefined,
                  }))
                }
              />
            </div>
            <div>
              <Label className="text-xs">إلى تاريخ</Label>
              <Input
                type="date"
                value={filters.to ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    to: e.target.value || undefined,
                  }))
                }
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الطلبات ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60 text-slate-300">
              <tr>
                <th className="p-3 text-start">تاريخ الطلب</th>
                {isApprover ? (
                  <th className="p-3 text-start">الموظف</th>
                ) : null}
                <th className="p-3 text-start">النوع</th>
                <th className="p-3 text-start">من</th>
                <th className="p-3 text-start">إلى</th>
                <th className="p-3 text-start">أيام</th>
                <th className="p-3 text-start">الحالة</th>
                <th className="p-3 text-start">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableBodySkeleton rows={5} columns={isApprover ? 8 : 7} />
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={isApprover ? 8 : 7}
                    className="p-8 text-center text-slate-400"
                  >
                    لا توجد طلبات
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-slate-800 hover:bg-slate-800/30"
                  >
                    <td className="p-3 text-slate-300">
                      {new Date(r.createdAt).toLocaleDateString('en-GB')}
                    </td>
                    {isApprover ? (
                      <td className="p-3">
                        <div className="text-slate-100">{r.user.fullName}</div>
                        <div className="text-xs text-slate-500">
                          {r.user.username}
                        </div>
                      </td>
                    ) : null}
                    <td className="p-3">{TYPE_LABEL[r.type]}</td>
                    <td className="p-3 font-mono">{r.startDate}</td>
                    <td className="p-3 font-mono">{r.endDate}</td>
                    <td className="p-3 text-center">{r.daysCount}</td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={STATUS_TONE[r.status]}
                      >
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {isApprover && r.status === 'PENDING' ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-emerald-300 border-emerald-500/40"
                              disabled={actionBusy === r.id}
                              onClick={() => void onApprove(r.id)}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-rose-300 border-rose-500/40"
                              disabled={actionBusy === r.id}
                              onClick={() => {
                                setRejectFor(r);
                                setRejectReason('');
                              }}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : null}
                        {!isApprover && r.status === 'PENDING' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            disabled={actionBusy === r.id}
                            onClick={() => void onCancel(r.id)}
                          >
                            إلغاء
                          </Button>
                        ) : null}
                        <Link
                          to={`/leaves/${r.id}/print`}
                          target="_blank"
                          className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-slate-700 px-2 text-xs hover:bg-slate-800"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          طباعة
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>طلب إجازة جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>نوع الإجازة</Label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  v && setForm((f) => ({ ...f, type: v as LeaveType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANNUAL">سنوية</SelectItem>
                  <SelectItem value="SICK">مرضية</SelectItem>
                  <SelectItem value="UNPAID">بدون راتب</SelectItem>
                  <SelectItem value="EMERGENCY">طارئة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>من</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, startDate: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>إلى</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, endDate: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <Label>السبب</Label>
              <Textarea
                rows={3}
                value={form.reason}
                onChange={(e) =>
                  setForm((f) => ({ ...f, reason: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={() => void onCreate()} disabled={saving}>
              {saving ? <Loader2 className="ms-1 h-4 w-4 animate-spin" /> : null}
              إرسال الطلب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog
        open={rejectFor !== null}
        onOpenChange={(open) => {
          if (!open) setRejectFor(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رفض طلب الإجازة</DialogTitle>
          </DialogHeader>
          <div>
            <Label>سبب الرفض</Label>
            <Textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>
              إلغاء
            </Button>
            <Button
              onClick={() => void onReject()}
              disabled={actionBusy !== null}
            >
              رفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-slate-400">{label}</div>
        <div className="mt-1 text-2xl font-semibold text-slate-100 tabular-nums">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

export default LeavesPage;
