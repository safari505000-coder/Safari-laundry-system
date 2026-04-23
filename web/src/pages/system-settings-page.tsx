import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertCircle,
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  Clock,
  HandCoins,
  Info,
  Landmark,
  Link2,
  Loader2,
  PiggyBank,
  PowerOff,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  type CommissionCalculationBase,
  type CommissionMode,
  type CommissionPayoutTiming,
  type CommissionRuleInput,
  type CommissionRuleRow,
  type DebtHoldMode,
  type DebtHoldPolicy,
  type PayrollSettings,
  type SystemToggleKey,
  type SystemToggleRow,
  getDebtHoldPolicy,
  getDefaultCommissionRule,
  getPayrollSettings,
  listSystemToggles,
  setSystemToggle,
  updateDebtHoldPolicy,
  updatePayrollSettings,
  upsertDefaultCommissionRule,
} from '@/lib/api';
import { Badge } from '@/modules/shared/components/ui/badge';
import {
  Button,
  buttonVariants,
} from '@/modules/shared/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
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

/**
 * V19.17 — Unified Settings Dashboard.
 *
 * Single page, progressive reveal: master toggles control which
 * sections are editable. Every section below uses dropdowns + toggles
 * (plus the minimal numeric inputs required for percentages / KD caps
 * / pay-day) — no free-form policy text anywhere.
 */

const TOGGLE_META: Record<
  SystemToggleKey,
  {
    titleAr: string;
    descAr: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  COMMISSION: {
    titleAr: 'العمولة',
    descAr: 'حساب وصرف مستحقات العمولة للموظفين.',
    icon: HandCoins,
  },
  DEBT_HOLD: {
    titleAr: 'محجوز المديونية',
    descAr:
      'حجب جزء من الراتب مقابل الفواتير الميدانية غير المحصَّلة وتحريرها بعد التحصيل.',
    icon: ShieldCheck,
  },
  PAYROLL: {
    titleAr: 'الرواتب',
    descAr: 'إنشاء ومعالجة مسيرات الرواتب.',
    icon: PiggyBank,
  },
  LOANS: {
    titleAr: 'السلف والقروض',
    descAr: 'قبول ومعالجة طلبات السلف مع الخصم التلقائي من الرواتب.',
    icon: Landmark,
  },
  ATTENDANCE: {
    titleAr: 'الحضور',
    descAr: 'تسجيل الحضور وترحيله إلى الرواتب.',
    icon: Clock,
  },
};

export function SystemSettingsPage() {
  const { token, hasRole } = useAuth();
  const isOwner = hasRole('OWNER', 'GENERAL_MANAGER');

  const [toggles, setToggles] = useState<SystemToggleRow[] | null>(null);
  const [debtPolicy, setDebtPolicy] = useState<DebtHoldPolicy | null>(null);
  const [payrollSettings, setPayrollSettings] =
    useState<PayrollSettings | null>(null);
  const [defaultRule, setDefaultRule] = useState<CommissionRuleRow | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<SystemToggleKey | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [t, p, ps, dr] = await Promise.all([
        listSystemToggles(token),
        getDebtHoldPolicy(token),
        getPayrollSettings(token),
        getDefaultCommissionRule(token),
      ]);
      setToggles(t);
      setDebtPolicy(p);
      setPayrollSettings(ps);
      setDefaultRule(dr);
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

  const isEnabled = (key: SystemToggleKey) =>
    (toggles ?? []).find((r) => r.key === key)?.isEnabled ?? false;

  async function handleToggle(key: SystemToggleKey, value: boolean) {
    if (!token) return;
    setSavingKey(key);
    try {
      const updated = await setSystemToggle(token, {
        key,
        isEnabled: value,
      });
      setToggles((rows) =>
        (rows ?? []).map((r) => (r.key === key ? updated : r)),
      );
      toast.success(value ? 'تم تفعيل النظام' : 'تم إيقاف النظام');
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">إعدادات النظام</h1>
          <p className="text-sm text-muted-foreground">
            تشغيل / إيقاف الأنظمة من مكان واحد، مع إعدادات تفصيلية تظهر
            تلقائياً عند التشغيل.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/commission-payouts"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
            )}
          >
            كشف العمولة <ChevronRight className="ms-1 size-4" />
          </Link>
          <Link
            to="/debt-holds"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
            )}
          >
            سجل المحجوز <ChevronRight className="ms-1 size-4" />
          </Link>
          <Link
            to="/settings/commission-rules"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
            )}
          >
            قواعد عمولة متقدمة <ChevronRight className="ms-1 size-4" />
          </Link>
        </div>
      </header>

      {/* ─── Section 1 — Master Toggles ───────────────────────── */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-lg font-semibold">
            المفاتيح الرئيسية (Master Control)
          </h2>
          <Badge variant="outline" className="text-xs">
            أعلى مستوى
          </Badge>
        </div>
        {loading && !toggles ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            {(toggles ?? []).map((row) => {
              const meta = TOGGLE_META[row.key];
              const Icon = meta.icon;
              return (
                <Card key={row.key} size="sm">
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Icon className="size-5 text-primary" />
                      <div className="flex-1 font-medium">{meta.titleAr}</div>
                      {savingKey === row.key ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Switch
                          checked={row.isEnabled}
                          onCheckedChange={(v) =>
                            handleToggle(row.key, Boolean(v))
                          }
                        />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {meta.descAr}
                    </p>
                    {row.isEnabled ? (
                      <Badge className="text-xs">مفعّل</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        موقوف
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── Section 2 — Commission (conditional) ─────────────── */}
      <ConditionalSection
        enabled={isEnabled('COMMISSION')}
        icon={HandCoins}
        title="إعدادات العمولة"
        disabledMessage="نظام العمولة موقوف — فعّله من الأعلى لعرض الإعدادات."
      >
        {loading && !defaultRule && toggles ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <CommissionQuickConfig
            value={defaultRule}
            onSaved={(r) => setDefaultRule(r)}
          />
        )}
      </ConditionalSection>

      {/* ─── Section 3 — Debt Hold (conditional) ──────────────── */}
      <ConditionalSection
        enabled={isEnabled('DEBT_HOLD')}
        icon={ShieldCheck}
        title="إعدادات محجوز المديونية"
        disabledMessage="نظام محجوز المديونية موقوف — فعّله من الأعلى لضبط السياسة."
      >
        {loading && !debtPolicy ? (
          <Skeleton className="h-40 w-full" />
        ) : debtPolicy ? (
          <DebtHoldPolicyEditor
            value={debtPolicy}
            onSaved={(p) => setDebtPolicy(p)}
          />
        ) : null}
      </ConditionalSection>

      {/* ─── Section 4 — Payroll (conditional) ────────────────── */}
      <ConditionalSection
        enabled={isEnabled('PAYROLL')}
        icon={PiggyBank}
        title="إعدادات الرواتب"
        disabledMessage="نظام الرواتب موقوف — فعّله من الأعلى لضبط الإعدادات."
      >
        {loading && !payrollSettings ? (
          <Skeleton className="h-40 w-full" />
        ) : payrollSettings ? (
          <PayrollSettingsEditor
            value={payrollSettings}
            onSaved={(s) => setPayrollSettings(s)}
          />
        ) : null}
      </ConditionalSection>

      {/* ─── Section 5 — Loans + Attendance (info only) ───────── */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <InfoCard
          icon={Landmark}
          title="السلف والقروض"
          enabled={isEnabled('LOANS')}
          message={
            isEnabled('LOANS')
              ? 'السلف مفعّلة — تُدار من صفحة السُلف، ويتم ربطها تلقائياً بمسير الرواتب حسب إعدادات الرواتب أعلاه.'
              : 'نظام السلف موقوف — لا يمكن إنشاء سلف جديدة أو خصمها من الرواتب.'
          }
        />
        <InfoCard
          icon={Clock}
          title="الحضور والانصراف"
          enabled={isEnabled('ATTENDANCE')}
          message={
            isEnabled('ATTENDANCE')
              ? 'الحضور مفعّل — يتم تسجيل الدوام يدوياً أو بيومترياً، ويؤثر على الرواتب إذا فعّلت "ربط الحضور" في إعدادات الرواتب.'
              : 'نظام الحضور موقوف — لا يتم تسجيل دخول/خروج للموظفين.'
          }
        />
      </section>
    </div>
  );
}

function ConditionalSection({
  enabled,
  icon: Icon,
  title,
  disabledMessage,
  children,
}: {
  enabled: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  disabledMessage: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">{title}</h2>
        {enabled ? (
          <Badge className="text-xs">مفعّل</Badge>
        ) : (
          <Badge variant="secondary" className="text-xs">
            موقوف
          </Badge>
        )}
      </div>
      {enabled ? (
        children
      ) : (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <PowerOff className="size-5" />
            <span>{disabledMessage}</span>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function InfoCard({
  icon: Icon,
  title,
  enabled,
  message,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  enabled: boolean;
  message: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2">
          <Icon className="size-5 text-primary" />
          <span className="font-medium">{title}</span>
          {enabled ? (
            <Badge className="ms-auto text-xs">مفعّل</Badge>
          ) : (
            <Badge variant="secondary" className="ms-auto text-xs">
              موقوف
            </Badge>
          )}
        </div>
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>{message}</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Commission quick-config (Dashboard default rule) ────────── */

const MODE_LABEL: Record<CommissionMode, string> = {
  SALE: 'على البيع',
  COLLECTION: 'على التحصيل',
};
const BASE_LABEL: Record<CommissionCalculationBase, string> = {
  ORDER_TOTAL: 'إجمالي الطلب',
  INVOICE_TOTAL: 'إجمالي الفاتورة',
  NET_AFTER_KNET: 'الصافي بعد خصم كي نت',
  EXCLUDE_SUBSCRIPTIONS: 'باستثناء الاشتراكات',
};
const TIMING_LABEL: Record<CommissionPayoutTiming, string> = {
  IMMEDIATE: 'مباشرة عند الكسب',
  AFTER_COLLECTION: 'بعد تحصيل الفاتورة كاملة',
  END_OF_MONTH: 'نهاية الشهر',
};

function CommissionQuickConfig({
  value,
  onSaved,
}: {
  value: CommissionRuleRow | null;
  onSaved: (r: CommissionRuleRow) => void;
}) {
  const { token } = useAuth();

  const [mode, setMode] = useState<CommissionMode>(
    value?.mode ?? 'COLLECTION',
  );
  const [base, setBase] = useState<CommissionCalculationBase>(
    value?.calculationBase ?? 'ORDER_TOTAL',
  );
  const [percentage, setPercentage] = useState<string>(
    value ? Number.parseFloat(value.percentage).toFixed(2) : '3',
  );
  const [minInvoice, setMinInvoice] = useState<string>(
    value ? Number.parseFloat(value.minInvoiceAmount).toFixed(3) : '0',
  );
  const [timing, setTiming] = useState<CommissionPayoutTiming>(
    value?.payoutTiming ?? 'AFTER_COLLECTION',
  );
  const [linkedToDebt, setLinkedToDebt] = useState(
    value?.linkedToDebt ?? true,
  );
  const [isActive, setIsActive] = useState(value?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!value) return;
    setMode(value.mode);
    setBase(value.calculationBase);
    setPercentage(Number.parseFloat(value.percentage).toFixed(2));
    setMinInvoice(Number.parseFloat(value.minInvoiceAmount).toFixed(3));
    setTiming(value.payoutTiming);
    setLinkedToDebt(value.linkedToDebt);
    setIsActive(value.isActive);
  }, [value]);

  async function handleSave() {
    if (!token) return;
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
      name: value?.name || 'القاعدة الافتراضية',
      isActive,
      role: null,
      mode,
      calculationBase: base,
      percentage: pct,
      minInvoiceAmount: minN,
      payoutTiming: timing,
      linkedToDebt,
    };
    setSaving(true);
    try {
      const saved = await upsertDefaultCommissionRule(token, dto);
      onSaved(saved);
      toast.success('تم حفظ إعدادات العمولة');
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          القاعدة الافتراضية
          {value ? (
            <Badge variant="outline" className="text-xs">
              قائمة
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">
              جديدة
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>طريقة الحساب</Label>
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
            <p className="text-xs text-muted-foreground">
              "على البيع" = عمولة عند اكتمال الطلب. "على التحصيل" = عند
              سداد الفاتورة.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>أساس حساب النسبة</Label>
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
            <Label>نسبة العمولة (%)</Label>
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
              الفواتير أقل من هذا المبلغ لا تُحسب عمولة عليها.
            </p>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>توقيت صرف العمولة</Label>
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
        </div>

        <div className="flex items-start justify-between rounded-lg border p-3">
          <div className="flex items-start gap-3">
            <Link2 className="mt-0.5 size-5 text-primary" />
            <div>
              <div className="font-medium">ربط العمولة بالمديونية</div>
              <div className="text-xs text-muted-foreground">
                عند التفعيل: لا تُصرف العمولة إذا كانت فاتورة الطلب ضمن
                المديونية غير المحصَّلة.
              </div>
            </div>
          </div>
          <Switch checked={linkedToDebt} onCheckedChange={setLinkedToDebt} />
        </div>

        <div className="flex items-start justify-between rounded-lg border p-3">
          <div className="flex items-start gap-3">
            <BadgeCheck className="mt-0.5 size-5 text-primary" />
            <div>
              <div className="font-medium">القاعدة نشطة</div>
              <div className="text-xs text-muted-foreground">
                إذا أوقفت القاعدة، لن يتم احتساب عمولة جديدة حتى لو كان
                نظام العمولة مفعّلاً.
              </div>
            </div>
          </div>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertCircle className="size-3.5" />
            <span>
              لإضافة قواعد لأدوار محددة،{' '}
              <Link
                to="/settings/commission-rules"
                className="text-primary hover:underline"
              >
                افتح القواعد المتقدمة
              </Link>
              .
            </span>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="me-2 size-4 animate-spin" />}
            حفظ إعدادات العمولة
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Debt-hold policy editor ─────────────────────────────────── */

function DebtHoldPolicyEditor({
  value,
  onSaved,
}: {
  value: DebtHoldPolicy;
  onSaved: (p: DebtHoldPolicy) => void;
}) {
  const { token } = useAuth();
  const [isActive, setIsActive] = useState(value.isActive);
  const [mode, setMode] = useState<DebtHoldMode>(value.holdMode);
  const [fixedAmount, setFixedAmount] = useState<string>(
    value.fixedAmount ?? '',
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIsActive(value.isActive);
    setMode(value.holdMode);
    setFixedAmount(value.fixedAmount ?? '');
  }, [value]);

  const dirty = useMemo(() => {
    if (isActive !== value.isActive) return true;
    if (mode !== value.holdMode) return true;
    const originalFixed = value.fixedAmount ?? '';
    const currentFixed = mode === 'FIXED' ? fixedAmount : '';
    if (originalFixed !== currentFixed) return true;
    return false;
  }, [isActive, mode, fixedAmount, value]);

  async function handleSave() {
    if (!token) return;
    const payload: Parameters<typeof updateDebtHoldPolicy>[1] = {
      isActive,
      holdMode: mode,
    };
    if (mode === 'FIXED') {
      const n = Number.parseFloat(fixedAmount);
      if (!Number.isFinite(n) || n <= 0) {
        toast.error('يرجى إدخال مبلغ ثابت صحيح أكبر من صفر');
        return;
      }
      payload.fixedAmount = n;
    }
    setSaving(true);
    try {
      const updated = await updateDebtHoldPolicy(token, payload);
      onSaved(updated);
      toast.success('تم حفظ سياسة الحجز');
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <div className="flex items-start justify-between rounded-lg border p-3">
          <div>
            <div className="font-medium">تشغيل سياسة الحجز</div>
            <div className="text-xs text-muted-foreground">
              عند التفعيل: النظام يحجز تلقائياً جزءاً من الراتب مقابل
              الفواتير غير المحصَّلة.
            </div>
          </div>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>طريقة الحجز</Label>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as DebtHoldMode)}
              disabled={!isActive}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FULL">حجز كامل المديونية</SelectItem>
                <SelectItem value="FIXED">
                  حجز مبلغ ثابت (يحدده المالك)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>المبلغ الثابت للحجز (د.ك)</Label>
            <Input
              type="number"
              step="0.001"
              min="0"
              value={fixedAmount}
              onChange={(e) => setFixedAmount(e.target.value)}
              disabled={!isActive || mode !== 'FIXED'}
              placeholder="مثال: 50.000"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving && <Loader2 className="me-2 size-4 animate-spin" />}
            حفظ السياسة
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Payroll settings editor ─────────────────────────────────── */

function PayrollSettingsEditor({
  value,
  onSaved,
}: {
  value: PayrollSettings;
  onSaved: (s: PayrollSettings) => void;
}) {
  const { token } = useAuth();
  const [payDay, setPayDay] = useState(value.payDayOfMonth);
  const [autoDeduct, setAutoDeduct] = useState(value.autoDeductLoans);
  const [linkAttendance, setLinkAttendance] = useState(
    value.linkWithAttendance,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPayDay(value.payDayOfMonth);
    setAutoDeduct(value.autoDeductLoans);
    setLinkAttendance(value.linkWithAttendance);
  }, [value]);

  const dirty =
    payDay !== value.payDayOfMonth ||
    autoDeduct !== value.autoDeductLoans ||
    linkAttendance !== value.linkWithAttendance;

  async function handleSave() {
    if (!token) return;
    if (!Number.isInteger(payDay) || payDay < 1 || payDay > 28) {
      toast.error('يوم صرف الراتب يجب أن يكون بين 1 و 28');
      return;
    }
    setSaving(true);
    try {
      const saved = await updatePayrollSettings(token, {
        payDayOfMonth: payDay,
        autoDeductLoans: autoDeduct,
        linkWithAttendance: linkAttendance,
      });
      onSaved(saved);
      toast.success('تم حفظ إعدادات الرواتب');
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2">
            <CalendarDays className="size-4" />
            يوم صرف الراتب من الشهر
          </Label>
          <Select
            value={String(payDay)}
            onValueChange={(v) => {
              if (v) setPayDay(Number.parseInt(v, 10));
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 28 }).map((_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  اليوم {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            يُستخدم كقيمة افتراضية لتاريخ المسير. الحد الأقصى 28 لتفادي
            انزلاق نهاية الشهر في فبراير.
          </p>
        </div>

        <div className="flex items-start justify-between rounded-lg border p-3">
          <div className="flex items-start gap-3">
            <Users className="mt-0.5 size-5 text-primary" />
            <div>
              <div className="font-medium">
                الخصم التلقائي للسلف من الراتب
              </div>
              <div className="text-xs text-muted-foreground">
                عند التفعيل: أقساط السلف المستحقة تُخصم تلقائياً في مسير
                الراتب الشهري.
              </div>
            </div>
          </div>
          <Switch checked={autoDeduct} onCheckedChange={setAutoDeduct} />
        </div>

        <div className="flex items-start justify-between rounded-lg border p-3">
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 size-5 text-primary" />
            <div>
              <div className="font-medium">ربط الرواتب بالحضور والتأخير</div>
              <div className="text-xs text-muted-foreground">
                عند التفعيل: الغياب غير المبرر والتأخير يُخصمان نسبياً من
                الراتب. (يتطلب تشغيل نظام الحضور أعلاه).
              </div>
            </div>
          </div>
          <Switch
            checked={linkAttendance}
            onCheckedChange={setLinkAttendance}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving && <Loader2 className="me-2 size-4 animate-spin" />}
            حفظ إعدادات الرواتب
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default SystemSettingsPage;
