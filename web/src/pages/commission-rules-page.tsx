import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  type CommissionCalculationBase,
  type CommissionMode,
  type CommissionPayoutTiming,
  type CommissionRuleInput,
  type CommissionRuleRow,
  type SafariRole,
  createCommissionRule,
  deleteCommissionRule,
  listCommissionRules,
  updateCommissionRule,
} from '@/lib/api';
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
  DialogDescription,
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
import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import { Switch } from '@/modules/shared/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';

const MODE_LABEL: Record<CommissionMode, string> = {
  SALE: 'بيع (عند اكتمال الطلب)',
  COLLECTION: 'تحصيل (عند سداد الفاتورة)',
};

const BASE_LABEL: Record<CommissionCalculationBase, string> = {
  ORDER_TOTAL: 'إجمالي الطلب',
  INVOICE_TOTAL: 'إجمالي الفاتورة',
  NET_AFTER_KNET: 'الصافي بعد خصم عمولة كي نت',
  EXCLUDE_SUBSCRIPTIONS: 'باستثناء الاشتراكات',
};

const TIMING_LABEL: Record<CommissionPayoutTiming, string> = {
  IMMEDIATE: 'فوري (عند الكسب)',
  AFTER_COLLECTION: 'بعد التحصيل الكامل للفاتورة',
  END_OF_MONTH: 'نهاية الشهر (قطع شهري)',
};

const ROLE_OPTIONS: { value: SafariRole | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'كل الأدوار (قاعدة عامة)' },
  { value: 'DRIVER', label: 'السائق' },
  { value: 'MANAGER', label: 'مدير الفرع' },
  { value: 'CALL_CENTER', label: 'مركز الاتصال' },
  { value: 'CALL_CENTER_SUPERVISOR', label: 'مشرف مركز الاتصال' },
  { value: 'ACCOUNTANT', label: 'المحاسب' },
  { value: 'SUPERVISOR', label: 'المشرف' },
];

export function CommissionRulesPage() {
  const { token, hasRole } = useAuth();
  const isOwner = hasRole('OWNER', 'GENERAL_MANAGER');

  const [rows, setRows] = useState<CommissionRuleRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CommissionRuleRow | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await listCommissionRules(token);
      setRows(data);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isOwner) return;
    void load();
  }, [isOwner, load]);

  if (!isOwner) {
    return <Navigate to="/" replace />;
  }

  async function handleDelete(row: CommissionRuleRow) {
    if (!token) return;
    if (!window.confirm(`هل تريد إيقاف القاعدة "${row.name}"؟`)) return;
    try {
      await deleteCommissionRule(token, row.id);
      toast.success('تم إيقاف القاعدة');
      void load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/settings/dashboard" className="hover:underline">
              لوحة الإعدادات
            </Link>
            <ArrowLeft className="size-3.5 -scale-x-100" />
            <span>قواعد العمولة</span>
          </div>
          <h1 className="text-2xl font-bold">قواعد العمولة</h1>
          <p className="text-sm text-muted-foreground">
            عند تفعيل نظام العمولة من اللوحة الرئيسية، تحكم هذه القواعد في
            حساب وصرف مستحقات الموظفين.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="me-2 size-4" /> إضافة قاعدة جديدة
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>قائمة القواعد</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !rows || rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              لا توجد قواعد بعد. اضغط "إضافة قاعدة جديدة" للبدء.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>الدور</TableHead>
                  <TableHead>النمط</TableHead>
                  <TableHead>أساس الحساب</TableHead>
                  <TableHead className="text-center">النسبة</TableHead>
                  <TableHead className="text-center">
                    الحد الأدنى للفاتورة
                  </TableHead>
                  <TableHead>التوقيت</TableHead>
                  <TableHead className="text-center">
                    مرتبط بالمديونية
                  </TableHead>
                  <TableHead className="text-center">الحالة</TableHead>
                  <TableHead className="text-end">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      {r.role
                        ? (ROLE_OPTIONS.find((o) => o.value === r.role)
                            ?.label ?? r.role)
                        : 'كل الأدوار'}
                    </TableCell>
                    <TableCell>{MODE_LABEL[r.mode]}</TableCell>
                    <TableCell>{BASE_LABEL[r.calculationBase]}</TableCell>
                    <TableCell className="text-center font-mono">
                      {Number.parseFloat(r.percentage).toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-center font-mono">
                      {Number.parseFloat(r.minInvoiceAmount).toFixed(3)}
                    </TableCell>
                    <TableCell>{TIMING_LABEL[r.payoutTiming]}</TableCell>
                    <TableCell className="text-center">
                      {r.linkedToDebt ? (
                        <Badge variant="secondary">نعم</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.isActive ? (
                        <Badge>مفعّل</Badge>
                      ) : (
                        <Badge variant="secondary">موقوف</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing(r)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(r)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {(creating || editing) && (
        <RuleDialog
          initial={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function RuleDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: CommissionRuleRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { token } = useAuth();
  const isEdit = Boolean(initial);

  const [name, setName] = useState(initial?.name ?? '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [role, setRole] = useState<SafariRole | 'ALL'>(
    initial?.role ?? 'ALL',
  );
  const [mode, setMode] = useState<CommissionMode>(
    initial?.mode ?? 'SALE',
  );
  const [base, setBase] = useState<CommissionCalculationBase>(
    initial?.calculationBase ?? 'ORDER_TOTAL',
  );
  const [percentage, setPercentage] = useState<string>(
    initial ? Number.parseFloat(initial.percentage).toFixed(2) : '5',
  );
  const [minInvoice, setMinInvoice] = useState<string>(
    initial ? Number.parseFloat(initial.minInvoiceAmount).toFixed(3) : '0',
  );
  const [timing, setTiming] = useState<CommissionPayoutTiming>(
    initial?.payoutTiming ?? 'AFTER_COLLECTION',
  );
  const [linkedToDebt, setLinkedToDebt] = useState(
    initial?.linkedToDebt ?? false,
  );
  const [saving, setSaving] = useState(false);

  const title = useMemo(
    () => (isEdit ? 'تعديل قاعدة عمولة' : 'إضافة قاعدة عمولة'),
    [isEdit],
  );

  async function handleSubmit() {
    if (!token) return;
    if (!name.trim()) {
      toast.error('الاسم مطلوب');
      return;
    }
    const pct = Number.parseFloat(percentage);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.error('النسبة يجب أن تكون بين 0 و 100');
      return;
    }
    const minN = Number.parseFloat(minInvoice || '0');
    if (!Number.isFinite(minN) || minN < 0) {
      toast.error('الحد الأدنى للفاتورة غير صالح');
      return;
    }
    const dto: CommissionRuleInput = {
      name: name.trim(),
      isActive,
      role: role === 'ALL' ? null : role,
      mode,
      calculationBase: base,
      percentage: pct,
      minInvoiceAmount: minN,
      payoutTiming: timing,
      linkedToDebt,
    };
    setSaving(true);
    try {
      if (isEdit && initial) {
        await updateCommissionRule(token, initial.id, dto);
      } else {
        await createCommissionRule(token, dto);
      }
      toast.success('تم الحفظ');
      onSaved();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            استخدم القوائم المنسدلة لضبط القاعدة. يتم تطبيقها تلقائياً بعد
            الحفظ.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label>اسم القاعدة</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: عمولة السائقين 5% — مبيعات"
            />
          </div>

          <div className="space-y-1.5">
            <Label>يطبق على</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as SafariRole | 'ALL')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>نمط العمولة</Label>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as CommissionMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MODE_LABEL) as CommissionMode[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODE_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>أساس الحساب</Label>
            <Select
              value={base}
              onValueChange={(v) =>
                setBase(v as CommissionCalculationBase)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(BASE_LABEL) as CommissionCalculationBase[]
                ).map((b) => (
                  <SelectItem key={b} value={b}>
                    {BASE_LABEL[b]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>توقيت الصرف</Label>
            <Select
              value={timing}
              onValueChange={(v) =>
                setTiming(v as CommissionPayoutTiming)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(TIMING_LABEL) as CommissionPayoutTiming[]
                ).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIMING_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>النسبة (%)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>الحد الأدنى للفاتورة (د.ك)</Label>
            <Input
              type="number"
              step="0.001"
              min="0"
              value={minInvoice}
              onChange={(e) => setMinInvoice(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              الفواتير أقل من هذا المبلغ لا يتم احتساب عمولة عليها.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
            <div>
              <div className="font-medium">ربط العمولة بالمديونية</div>
              <div className="text-xs text-muted-foreground">
                عند التفعيل، تُلغى العمولة تلقائياً إذا كانت فاتورة الطلب
                ضمن المديونية المحجوزة.
              </div>
            </div>
            <Switch
              checked={linkedToDebt}
              onCheckedChange={setLinkedToDebt}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
            <div>
              <div className="font-medium">القاعدة نشطة</div>
              <div className="text-xs text-muted-foreground">
                القواعد غير النشطة لا يتم تطبيقها على الطلبات الجديدة.
              </div>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="me-2 size-4 animate-spin" />}
            {isEdit ? 'حفظ التعديل' : 'إضافة'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CommissionRulesPage;
