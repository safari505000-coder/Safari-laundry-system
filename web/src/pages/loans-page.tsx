import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BanknoteArrowUp,
  CheckCircle2,
  Loader2,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { notify } from '@/lib/notify';
import {
  approveLoan,
  createLoan,
  deductLoan,
  listLoans,
  listMyLoans,
  rejectLoan,
  type LoanFilters,
  type LoanRow,
  type LoanStatusApi,
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
 * Stage-D — Employee loans. Self-service portal that flips into an
 * approver workbench when the user has `hr.loans.approve`.
 *
 * V19.19 — approved loans go to ACTIVE but are NO LONGER eaten down
 * automatically by payroll. Repayment is now a standalone OWNER/GM
 * action via the "خصم يدوي" dialog below (POST /api/loans/:id/deduct).
 * This mirrors the debt-hold voucher flow and prevents double-deduction
 * when the same month's payroll is re-run.
 */

const STATUS_TONE: Record<LoanStatusApi, string> = {
  PENDING: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  APPROVED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  ACTIVE: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  SETTLED: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  REJECTED: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

const STATUS_LABEL: Record<LoanStatusApi, string> = {
  PENDING: 'بانتظار الاعتماد',
  APPROVED: 'معتمدة',
  ACTIVE: 'جارية',
  SETTLED: 'مسدّدة',
  REJECTED: 'مرفوضة',
};

export function LoansPage() {
  const { user, token } = useAuth();
  const isApprover = can(user, 'hr.loans.approve');
  const canDeduct = can(user, 'hr.loans.deduct');

  const [rows, setRows] = useState<LoanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<LoanFilters>({});

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    amount: '',
    installmentCount: '3',
    reason: '',
  });
  const [saving, setSaving] = useState(false);

  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<LoanRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // V19.19 — manual deduction dialog state (OWNER / GM only).
  const [deductFor, setDeductFor] = useState<LoanRow | null>(null);
  const [deductAmount, setDeductAmount] = useState('');
  const [deductNote, setDeductNote] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = isApprover
        ? await listLoans(token, filters)
        : await listMyLoans(token);
      setRows(data);
    } catch (e) {
      notify.error(e, { fallback: 'فشل تحميل السُلف' });
    } finally {
      setLoading(false);
    }
  }, [token, isApprover, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    let active = 0;
    let remaining = 0;
    let pending = 0;
    for (const r of rows) {
      if (r.status === 'ACTIVE') {
        active += 1;
        remaining += Number(r.remaining);
      }
      if (r.status === 'PENDING') pending += 1;
    }
    return { active, remaining, pending };
  }, [rows]);

  const onCreate = useCallback(async () => {
    if (!token) return;
    const amount = Number(form.amount);
    const installmentCount = Number(form.installmentCount);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify.error('المبلغ غير صحيح');
      return;
    }
    if (!Number.isInteger(installmentCount) || installmentCount <= 0) {
      notify.error('عدد الأقساط غير صحيح');
      return;
    }
    setSaving(true);
    try {
      await createLoan(token, {
        amount,
        installmentCount,
        reason: form.reason || undefined,
      });
      notify.success('تم إنشاء طلب السلفة');
      setCreateOpen(false);
      setForm({ amount: '', installmentCount: '3', reason: '' });
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
        await approveLoan(token, id);
        notify.success('تم اعتماد السلفة');
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
      await rejectLoan(token, rejectFor.id, rejectReason.trim());
      notify.success('تم رفض السلفة');
      setRejectFor(null);
      setRejectReason('');
      await load();
    } catch (e) {
      notify.error(e, { fallback: 'فشل الرفض' });
    } finally {
      setActionBusy(null);
    }
  }, [token, rejectFor, rejectReason, load]);

  const onDeduct = useCallback(async () => {
    if (!token || !deductFor) return;
    const amount = Number(deductAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify.error('المبلغ غير صحيح');
      return;
    }
    const remaining = Number(deductFor.remaining);
    if (amount > remaining + 0.0005) {
      notify.error(
        `المبلغ يتجاوز المتبقي (${remaining.toFixed(3)} د.ك)`,
      );
      return;
    }
    setActionBusy(deductFor.id);
    try {
      await deductLoan(
        token,
        deductFor.id,
        amount,
        deductNote.trim() || undefined,
      );
      notify.success('تم تسجيل الخصم اليدوي');
      setDeductFor(null);
      setDeductAmount('');
      setDeductNote('');
      await load();
    } catch (e) {
      notify.error(e, { fallback: 'فشل تسجيل الخصم' });
    } finally {
      setActionBusy(null);
    }
  }, [token, deductFor, deductAmount, deductNote, load]);

  const monthlyPreview = useMemo(() => {
    const a = Number(form.amount);
    const n = Number(form.installmentCount);
    if (!Number.isFinite(a) || !Number.isInteger(n) || n <= 0 || a <= 0)
      return null;
    return (a / n).toFixed(3);
  }, [form.amount, form.installmentCount]);

  return (
    <div className="space-y-6 p-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-50">
            <BanknoteArrowUp className="h-6 w-6 text-emerald-400" />
            سُلف الموظفين
          </h1>
          <p className="text-sm text-slate-400">
            {isApprover
              ? 'اعتماد السُلف وإدارة الأقساط الشهرية عبر الرواتب.'
              : 'طلبات السُلف الخاصة بك والأقساط المتبقية.'}
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
            طلب سلفة
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="بانتظار الاعتماد" value={totals.pending.toString()} />
        <Stat label="سُلف جارية" value={totals.active.toString()} />
        <Stat
          label="إجمالي المتبقي (د.ك)"
          value={totals.remaining.toFixed(3)}
        />
      </div>

      {isApprover ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الفلاتر</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div>
              <Label className="text-xs">الحالة</Label>
              <Select
                value={filters.status ?? 'ALL'}
                onValueChange={(v) =>
                  setFilters((f) => ({
                    ...f,
                    status:
                      !v || v === 'ALL' ? undefined : (v as LoanStatusApi),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">الكل</SelectItem>
                  <SelectItem value="PENDING">بانتظار</SelectItem>
                  <SelectItem value="ACTIVE">جارية</SelectItem>
                  <SelectItem value="SETTLED">مسدّدة</SelectItem>
                  <SelectItem value="REJECTED">مرفوضة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">السُلف ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60 text-slate-300">
              <tr>
                <th className="p-3 text-start">تاريخ الطلب</th>
                {isApprover ? (
                  <th className="p-3 text-start">الموظف</th>
                ) : null}
                <th className="p-3 text-start">المبلغ</th>
                <th className="p-3 text-start">عدد الأقساط</th>
                <th className="p-3 text-start">القسط الشهري</th>
                <th className="p-3 text-start">المتبقي</th>
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
                    لا توجد سُلف
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
                    <td className="p-3 font-mono tabular-nums">
                      {Number(r.amount).toFixed(3)}
                    </td>
                    <td className="p-3 text-center">{r.installmentCount}</td>
                    <td className="p-3 font-mono tabular-nums">
                      {Number(r.monthlyDeduction).toFixed(3)}
                    </td>
                    <td className="p-3 font-mono tabular-nums">
                      {Number(r.remaining).toFixed(3)}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={STATUS_TONE[r.status]}>
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
                              title="اعتماد"
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
                              title="رفض"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : null}
                        {canDeduct && r.status === 'ACTIVE' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-sky-300 border-sky-500/40"
                            disabled={actionBusy === r.id}
                            onClick={() => {
                              setDeductFor(r);
                              setDeductAmount(
                                Number(r.monthlyDeduction).toFixed(3),
                              );
                              setDeductNote('');
                            }}
                            title="خصم يدوي"
                          >
                            <Minus className="h-3.5 w-3.5" />
                            <span className="ms-1 text-xs">خصم</span>
                          </Button>
                        ) : null}
                        <Link
                          to={`/loans/${r.id}/print`}
                          target="_blank"
                          className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-slate-700 px-2 text-xs hover:bg-slate-800"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          إقرار
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
            <DialogTitle>طلب سلفة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>المبلغ (د.ك)</Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>عدد الأقساط الشهرية</Label>
              <Input
                type="number"
                step="1"
                min="1"
                value={form.installmentCount}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    installmentCount: e.target.value,
                  }))
                }
              />
            </div>
            {monthlyPreview ? (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                القسط الشهري التقديري:{' '}
                <span className="font-mono">{monthlyPreview}</span> د.ك
              </div>
            ) : null}
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
              {saving ? (
                <Loader2 className="ms-1 h-4 w-4 animate-spin" />
              ) : null}
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
            <DialogTitle>رفض السلفة</DialogTitle>
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

      {/* V19.19 — Manual deduction dialog (OWNER / GM only) */}
      <Dialog
        open={deductFor !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeductFor(null);
            setDeductAmount('');
            setDeductNote('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>خصم يدوي من السلفة</DialogTitle>
          </DialogHeader>
          {deductFor ? (
            <div className="space-y-3">
              <div className="rounded-md border border-slate-700 bg-slate-800/40 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">الموظف</span>
                  <span className="text-slate-100">
                    {deductFor.user.fullName}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-slate-400">أصل السلفة</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {Number(deductFor.amount).toFixed(3)} د.ك
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-slate-400">المتبقي حالياً</span>
                  <span className="font-mono tabular-nums text-amber-300">
                    {Number(deductFor.remaining).toFixed(3)} د.ك
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-slate-400">القسط الشهري المقترح</span>
                  <span className="font-mono tabular-nums text-slate-300">
                    {Number(deductFor.monthlyDeduction).toFixed(3)} د.ك
                  </span>
                </div>
              </div>
              <div>
                <Label>المبلغ المخصوم (د.ك)</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  max={Number(deductFor.remaining).toFixed(3)}
                  value={deductAmount}
                  onChange={(e) => setDeductAmount(e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500">
                  الحد الأقصى: {Number(deductFor.remaining).toFixed(3)} د.ك
                </p>
              </div>
              <div>
                <Label>ملاحظة (اختياري)</Label>
                <Textarea
                  rows={2}
                  placeholder="مثال: كاش مستلم — إيصال رقم 482"
                  value={deductNote}
                  onChange={(e) => setDeductNote(e.target.value)}
                />
              </div>
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                الخصم خارج دورة الراتب — لن يظهر كخصم في مسير الرواتب.
                يُنزل فقط من المتبقي، ويُختم «مسدّدة» تلقائياً عند الصفر.
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeductFor(null);
                setDeductAmount('');
                setDeductNote('');
              }}
            >
              إلغاء
            </Button>
            <Button
              onClick={() => void onDeduct()}
              disabled={actionBusy !== null}
            >
              {actionBusy !== null ? (
                <Loader2 className="ms-1 h-4 w-4 animate-spin" />
              ) : null}
              تأكيد الخصم
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

export default LoansPage;
