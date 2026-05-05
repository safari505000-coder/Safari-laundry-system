import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertCircle,
  BadgeCheck,
  Bell,
  CalendarDays,
  ChevronRight,
  Clock,
  CreditCard,
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
  type PaymentMethodFeeConfig,
  type KnetCommissionRule,
  type SystemConfigResponse,
  type SystemToggleKey,
  type SystemToggleRow,
  getDebtHoldPolicy,
  getDefaultCommissionRule,
  getPaymentMethodFeeConfig,
  getPayrollSettings,
  getSystemConfig,
  listSystemToggles,
  setSystemToggle,
  updateDebtHoldPolicy,
  updatePayrollSettings,
  updatePaymentMethodFeeConfig,
  updateSystemConfig,
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
  // OWNER-only sections (e.g. WhatsApp alert recipient) are gated
  // separately so a GM can still read the rest of this page without
  // hitting a 403 on the system-config fetch.
  const isStrictOwner = hasRole('OWNER');

  const [toggles, setToggles] = useState<SystemToggleRow[] | null>(null);
  const [debtPolicy, setDebtPolicy] = useState<DebtHoldPolicy | null>(null);
  const [payrollSettings, setPayrollSettings] =
    useState<PayrollSettings | null>(null);
  const [defaultRule, setDefaultRule] = useState<CommissionRuleRow | null>(
    null,
  );
  const [paymentFeeConfig, setPaymentFeeConfig] =
    useState<PaymentMethodFeeConfig | null>(null);
  const [systemConfig, setSystemConfig] =
    useState<SystemConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<SystemToggleKey | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [t, p, ps, dr, fee] = await Promise.all([
        listSystemToggles(token),
        getDebtHoldPolicy(token),
        getPayrollSettings(token),
        getDefaultCommissionRule(token),
        getPaymentMethodFeeConfig(token),
      ]);
      setToggles(t);
      setDebtPolicy(p);
      setPayrollSettings(ps);
      setDefaultRule(dr);
      setPaymentFeeConfig(fee);
      // System config is OWNER-only; fetch it separately so a GM
      // doesn't see a noisy toast for a 403 on this page.
      if (isStrictOwner) {
        try {
          const cfg = await getSystemConfig(token);
          setSystemConfig(cfg);
        } catch (e) {
          if (e instanceof ApiError && e.status !== 403) {
            toast.error(e.message);
          }
        }
      }
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, isStrictOwner]);

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

      {/* ─── System Alerts (Owner only) ─────────────────────────── */}
      {isStrictOwner ? (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Bell className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">
              تنبيهات النظام (System Alerts)
            </h2>
            <Badge variant="outline" className="text-xs">
              للمالك فقط
            </Badge>
          </div>
          {loading && !systemConfig ? (
            <Skeleton className="h-40 w-full" />
          ) : systemConfig ? (
            <SystemAlertsEditor
              value={systemConfig}
              onSaved={(c) => setSystemConfig(c)}
            />
          ) : null}
        </section>
      ) : null}

      {/* ─── KNET / card fee estimates (reporting) ─────────────── */}
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold">
            عمولة كي نت وروابط الدفع
          </h2>
          <p className="text-sm text-muted-foreground">
            تُستخدم تقريبياً في الأرباح ورسوم البنوك في التقارير — لا تغيّر مبالغ
            فواتير العملاء. اختر مبلغاً ثابتاً لكل عملية (يدوي)، أو نسبة فقط، أو
            الأعلى بين المبلغ الثابت والنسبة.
          </p>
        </div>
        {loading && !paymentFeeConfig ?
          <Skeleton className="h-56 w-full" />
        : paymentFeeConfig ?
          <KnetPaymentFeeEditor
            value={paymentFeeConfig}
            onSaved={(c) => setPaymentFeeConfig(c)}
          />
        : null}
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

const KNET_RULE_OPTIONS: { value: KnetCommissionRule; label: string }[] = [
  {
    value: 'HIGHER_OF_FLAT_AND_PERCENT',
    label: 'الأعلى بين مبلغ ثابت ونسبة (يُقارن الحقلان أدناه)',
  },
  {
    value: 'FLAT_ONLY',
    label: 'مبلغ ثابت يدوي (د.ك) لكل عملية كي نت',
  },
  {
    value: 'PERCENT_ONLY',
    label: 'نسبة يدوية من قيمة الفاتورة (كي نت)',
  },
];

function KnetPaymentFeeEditor({
  value,
  onSaved,
}: {
  value: PaymentMethodFeeConfig;
  onSaved: (c: PaymentMethodFeeConfig) => void;
}) {
  const { token } = useAuth();
  const [knetRule, setKnetRule] = useState<KnetCommissionRule>(value.knetRule);
  const [knetFlatKd, setKnetFlatKd] = useState(
    Number.parseFloat(value.knetFlatKd).toString(),
  );
  const [knetPercentOfGross, setKnetPercentOfGross] = useState(
    Number.parseFloat(value.knetPercentOfGross).toString(),
  );
  const [cardPercentOfGross, setCardPercentOfGross] = useState(
    Number.parseFloat(value.cardPercentOfGross).toString(),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setKnetRule(value.knetRule);
    setKnetFlatKd(Number.parseFloat(value.knetFlatKd).toString());
    setKnetPercentOfGross(
      Number.parseFloat(value.knetPercentOfGross).toString(),
    );
    setCardPercentOfGross(
      Number.parseFloat(value.cardPercentOfGross).toString(),
    );
  }, [value]);

  const parseNum = (s: string) => {
    const n = Number.parseFloat(s.replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  };

  const flatN = parseNum(knetFlatKd);
  const knetPctN = parseNum(knetPercentOfGross);
  const cardPctN = parseNum(cardPercentOfGross);
  const dirty =
    knetRule !== value.knetRule ||
    Math.abs(flatN - Number.parseFloat(value.knetFlatKd)) > 1e-6 ||
    Math.abs(knetPctN - Number.parseFloat(value.knetPercentOfGross)) > 1e-7 ||
    Math.abs(cardPctN - Number.parseFloat(value.cardPercentOfGross)) > 1e-7;

  async function handleSave() {
    if (!token) return;
    if (
      [flatN, knetPctN, cardPctN].some((n) => !Number.isFinite(n) || n < 0)
    ) {
      toast.error('تأكد من إدخال أرقام صحيحة (صفر فأعلى).');
      return;
    }
    setSaving(true);
    try {
      const saved = await updatePaymentMethodFeeConfig(token, {
        knetRule,
        knetFlatKd: flatN,
        knetPercentOfGross: knetPctN,
        cardPercentOfGross: cardPctN,
      });
      onSaved(saved);
      toast.success('تم حفظ تقديرات رسوم كي نت');
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <div className="flex items-start gap-2 rounded-md border border-sky-200/80 bg-sky-50/60 px-3 py-2 text-xs text-sky-950">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            حقل &quot;مبلغ ثابت&quot; و&quot;نسبة كي نت&quot; يتحكمان بفواتير
            كي نت. حقل &quot;نسبة البطاقة/الرابط&quot; لـ الدفع عبر رابط/أونلاين
            (ليست كي نت). لتحصيل مبلغ ثابت فقط: اختر &quot;مبلغ ثابت يدوي&quot;
            وأدخل المبلغ بالدينار.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-2">
            <CreditCard className="size-4" />
            طريقة احتساب عمولة كي نت
          </Label>
          <Select
            value={knetRule}
            onValueChange={(v) => v && setKnetRule(v as KnetCommissionRule)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KNET_RULE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>مبلغ ثابت كي نت (د.ك / عملية)</Label>
            <Input
              type="text"
              inputMode="decimal"
              className="font-mono tabular-nums"
              dir="ltr"
              value={knetFlatKd}
              onChange={(e) => setKnetFlatKd(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              مثال: 0.100 — يُستخدم حسب الطريقة أعلاه.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>نسبة كي نت (عشري: 0.015 = 1.5%)</Label>
            <Input
              type="text"
              inputMode="decimal"
              className="font-mono tabular-nums"
              dir="ltr"
              value={knetPercentOfGross}
              onChange={(e) => setKnetPercentOfGross(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              يُتجاهل عند &quot;مبلغ ثابت يدوي فقط&quot;.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-2">
            <Link2 className="size-4" />
            نسبة رابط الدفع / أونلاين (عشري: 0.025 = 2.5%)
          </Label>
          <Input
            type="text"
            inputMode="decimal"
            className="max-w-sm font-mono tabular-nums"
            dir="ltr"
            value={cardPercentOfGross}
            onChange={(e) => setCardPercentOfGross(e.target.value)}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          آخر تحديث:{' '}
          {new Date(value.updatedAt).toLocaleString('ar-KW', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </p>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving && <Loader2 className="me-2 size-4 animate-spin" />}
            حفظ
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── System alerts (Owner WhatsApp recipient) ──────────────── */

/**
 * Kuwait mobile validator — mirrors the backend's
 * `parseKuwaitMobile965` so the input rejects the same shapes the
 * server would. NEVER touches financial state.
 */
function isValidKuwaitMobile(input: string): boolean {
  const compact = input.replace(/[\s-+]/g, '');
  if (/^[569]\d{7}$/.test(compact)) return true;
  if (/^965[569]\d{7}$/.test(compact)) return true;
  if (/^00965[569]\d{7}$/.test(compact)) return true;
  return false;
}

function maskPhone(digits: string): string {
  if (digits.length < 6) return '***';
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

function SystemAlertsEditor({
  value,
  onSaved,
}: {
  value: SystemConfigResponse;
  onSaved: (cfg: SystemConfigResponse) => void;
}) {
  const { token } = useAuth();
  const [phone, setPhone] = useState<string>(value.guardianPhone ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPhone(value.guardianPhone ?? '');
  }, [value]);

  const trimmed = phone.trim();
  const isEmpty = trimmed.length === 0;
  const isValid = isEmpty || isValidKuwaitMobile(trimmed);
  const dirty = trimmed !== (value.guardianPhone ?? '');

  async function handleSave() {
    if (!token) return;
    if (!isValid) {
      toast.error('رقم الواتساب غير صالح. مثال: 96591234567');
      return;
    }
    setSaving(true);
    try {
      const next = await updateSystemConfig(token, {
        guardianPhone: isEmpty ? null : trimmed,
      });
      onSaved(next);
      toast.success(
        isEmpty
          ? 'تم مسح رقم تنبيهات النظام (سيُستخدم الرقم الافتراضي إن وُجد).'
          : 'تم حفظ رقم واتساب التنبيهات.',
      );
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!token) return;
    setSaving(true);
    try {
      const next = await updateSystemConfig(token, { guardianPhone: null });
      onSaved(next);
      setPhone('');
      toast.success('تم مسح الرقم — سيتم استخدام رقم البيئة الافتراضي إن وُجد.');
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  const resolvedSourceLabel: Record<
    SystemConfigResponse['resolved']['source'],
    string
  > = {
    database: 'محفوظ في قاعدة البيانات',
    env: 'متغير بيئة (Fallback)',
    none: 'غير مهيأ — لن تُرسل تنبيهات واتساب',
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <div className="flex items-start gap-2 rounded-md border border-sky-200/80 bg-sky-50/60 px-3 py-2 text-xs text-sky-950">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            هذا الرقم يستلم تنبيهات نظام الحماية (System Guardian) عبر
            الواتساب فقط. لا يتعلق بأي عملية مالية. يُقبل صيغ:{' '}
            <span className="font-mono" dir="ltr">
              96591234567
            </span>{' '}
            أو{' '}
            <span className="font-mono" dir="ltr">
              +96591234567
            </span>{' '}
            أو الرقم المحلي{' '}
            <span className="font-mono" dir="ltr">
              91234567
            </span>
            .
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-2">
            <Bell className="size-4" />
            رقم واتساب التنبيهات
          </Label>
          <Input
            type="tel"
            inputMode="tel"
            dir="ltr"
            className="max-w-sm font-mono tabular-nums"
            placeholder="96591234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={!isValid}
          />
          {!isValid ? (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="size-3.5" />
              صيغة الرقم غير صحيحة. ابدأ بـ 5 أو 6 أو 9 (٨ أرقام).
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              اتركه فارغاً للعودة إلى الإعداد الافتراضي من البيئة (إن وُجد).
            </p>
          )}
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">المصدر النشط حالياً</span>
            <Badge
              variant={
                value.resolved.source === 'none' ? 'secondary' : 'outline'
              }
              className="text-xs"
            >
              {resolvedSourceLabel[value.resolved.source]}
            </Badge>
          </div>
          <div className="mt-1 text-muted-foreground" dir="ltr">
            {value.resolved.phone
              ? maskPhone(value.resolved.phone)
              : 'غير مهيأ'}
          </div>
          {value.updatedAt ? (
            <div className="mt-1 text-muted-foreground">
              آخر تعديل:{' '}
              {new Date(value.updatedAt).toLocaleString('ar-KW', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2">
          {value.guardianPhone ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={saving}
            >
              مسح الرقم
            </Button>
          ) : null}
          <Button onClick={handleSave} disabled={!dirty || saving || !isValid}>
            {saving && <Loader2 className="me-2 size-4 animate-spin" />}
            حفظ
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default SystemSettingsPage;
