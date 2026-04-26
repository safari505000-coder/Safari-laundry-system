import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BadgeDollarSign,
  Banknote,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  PlayCircle,
  Plus,
  Printer,
  RefreshCw,
  Save,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  apiJson,
  createManualDebtHold,
  exportPayrollXlsx,
  listDebtHolds,
  recalcPayrollLoan,
  updateSalaryDefaults,
  type BranchRow,
  type DebtHoldRow,
  type PayrollRow,
  type TeamUserRow,
} from '@/lib/api';
import { formatKwdLabel, sumKwdStrings } from '@/lib/kwd';
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
import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';
import { Textarea } from '@/modules/shared/components/ui/textarea';

/**
 * V19.17 — Unified payroll run page.
 *
 * One smart surface for the whole monthly payroll flow:
 *   • Month selector + branch-grouped tables
 *   • Unsaved employee rows are inline forms pre-filled from each
 *     user's salary defaults (`User.basicMonthlySalary` +
 *     `User.monthlyAllowances`) with editable inputs for this month's
 *     basic / allowances / manual deductions.
 *   • Saving a row POSTs the payroll (which auto-computes commission
 *     roll-up, debt-release, and debt-hold snapshot inside one Prisma
 *     transaction) AND patches the user's defaults so next month's
 *     run starts from the same numbers by default.
 *   • Already-saved rows render read-only with the full band
 *     breakdown and a "مسجّل" badge.
 *   • A row-level "حجز يدوي" button opens the same manual-hold
 *     dialog we had on the old registry page; release lives on the
 *     separate `/staff-hub?tab=debt-holds` tab.
 *   • A global "اعتماد المسير كامل" button sweeps every unsaved row
 *     that has a non-zero basic salary and saves them in sequence.
 *
 * This replaces the earlier two-page split (register + roll) after
 * the Owner reported it was confusing to enter data in one tab and
 * have to trigger generation from another.
 */

function monthRangeIso(ym: string): { from: string; to: string } {
  const [ys, ms] = ym.split('-');
  const y = Number.parseInt(ys ?? '0', 10);
  const m = Number.parseInt(ms ?? '1', 10);
  const from = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const to = new Date(y, m, 0, 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

function f(n: string | null | undefined): number {
  if (!n) return 0;
  const v = Number.parseFloat(n);
  return Number.isFinite(v) ? v : 0;
}

function payrollNet(row: PayrollRow): number {
  // V19.20 — mirrors backend `PayrollService.netPay`. The loan
  // instalment is subtracted alongside deductions + debt-hold so the
  // grid, totals, and the A4 payslip all agree to 4 decimals.
  return (
    f(row.basicSalary) +
    f(row.allowances) +
    f(row.commissionAmount) +
    f(row.debtReleaseAmount) -
    f(row.deductions) -
    f(row.debtHoldAmount) -
    f(row.loanDeduction)
  );
}

interface EditBuffer {
  basic: string;
  allow: string;
  deduct: string;
}

export function PayrollUnifiedPage() {
  const { token, hasRole } = useAuth();
  const isAdmin = hasRole('OWNER', 'GENERAL_MANAGER');

  // V19.22 — keep the selected month in the URL (?ym=YYYY-MM) so the
  // Staff Hub print button can read it and open the dedicated roster
  // route on the exact month the user is looking at, and so the
  // month is bookmarkable / restorable on refresh.
  const [searchParams, setSearchParams] = useSearchParams();
  const [month, setMonth] = useState(() => {
    const fromUrl = searchParams.get('ym');
    if (fromUrl && /^\d{4}-\d{2}$/.test(fromUrl)) return fromUrl;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    const current = searchParams.get('ym');
    if (current === month) return;
    const next = new URLSearchParams(searchParams);
    next.set('ym', month);
    setSearchParams(next, { replace: true });
  }, [month, searchParams, setSearchParams]);

  const [payrolls, setPayrolls] = useState<PayrollRow[] | null>(null);
  const [users, setUsers] = useState<TeamUserRow[] | null>(null);
  const [branches, setBranches] = useState<BranchRow[] | null>(null);
  const [heldByUser, setHeldByUser] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  // V19.20 — "إعادة حساب القسط" button tracks the payroll id being
  // recalculated so the button spinner matches the row in flight.
  const [recalcingId, setRecalcingId] = useState<string | null>(null);

  // Per-row edit buffer keyed by userId. Populated lazily on first
  // keystroke from the defaults so we don't have to instantiate a
  // controlled input for every employee on page load.
  const [buffers, setBuffers] = useState<Record<string, EditBuffer>>({});

  /** '' = every branch; otherwise focus one branch card (easier mass edits). */
  const [branchFilter, setBranchFilter] = useState<string>('');

  /**
   * Manual-hold dialog state. Carries the employee AND — when opened
   * from an already-saved row — the payroll id so the new hold can be
   * stamped on that payslip immediately (updating `debtHoldAmount` in
   * one transaction). If opened from a draft row, `payrollId` stays
   * undefined and the hold is absorbed by the next save.
   */
  const [holdDialogFor, setHoldDialogFor] = useState<
    { user: TeamUserRow; payrollId?: string } | null
  >(null);

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { from, to } = monthRangeIso(month);
      const qs = new URLSearchParams({ from, to });
      const [p, u, b, h] = await Promise.all([
        apiJson<PayrollRow[]>(`/api/payroll?${qs.toString()}`, { token }),
        apiJson<TeamUserRow[]>('/api/users', { token }),
        apiJson<BranchRow[]>('/api/branches', { token }),
        listDebtHolds(token, { status: 'HELD' }),
      ]);
      setPayrolls(Array.isArray(p) ? p : []);
      setUsers(Array.isArray(u) ? u : []);
      setBranches(Array.isArray(b) ? b : []);
      const heldMap = new Map<string, number>();
      for (const row of Array.isArray(h) ? h : []) {
        heldMap.set(
          row.employeeUserId,
          (heldMap.get(row.employeeUserId) ?? 0) + f(row.holdAmount),
        );
      }
      setHeldByUser(heldMap);
      setBuffers({});
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, month]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadAll();
  }, [isAdmin, loadAll]);

  const payrollByUserId = useMemo(() => {
    const map = new Map<string, PayrollRow>();
    for (const p of payrolls ?? []) map.set(p.userId, p);
    return map;
  }, [payrolls]);

  const branchGroups = useMemo(() => {
    const branchesById = new Map((branches ?? []).map((b) => [b.id, b]));
    const groups = new Map<string, { branch: BranchRow; users: TeamUserRow[] }>();
    for (const u of (users ?? []).filter((x) => x.isActive)) {
      const key = u.branchId ?? '__unassigned__';
      const branch: BranchRow =
        (u.branchId && branchesById.get(u.branchId)) ||
        ({
          id: '__unassigned__',
          name: 'بدون فرع',
          location: '',
          phone: '',
          isActive: true,
          isAdministrative: false,
          updatedAt: '',
        } as BranchRow);
      const bucket = groups.get(key) ?? { branch, users: [] };
      bucket.users.push(u);
      groups.set(key, bucket);
    }
    return Array.from(groups.values())
      .sort((a, b) => a.branch.name.localeCompare(b.branch.name, 'ar'))
      .map((g) => ({
        branch: g.branch,
        users: g.users.sort((a, b) =>
          a.fullName.localeCompare(b.fullName, 'ar'),
        ),
      }));
  }, [users, branches]);

  const visibleBranchGroups = useMemo(() => {
    if (!branchFilter) return branchGroups;
    return branchGroups.filter((g) => g.branch.id === branchFilter);
  }, [branchGroups, branchFilter]);

  const grandTotals = useMemo(() => {
    const rows = payrolls ?? [];
    return {
      count: rows.length,
      basicAllow: (
        f(sumKwdStrings(rows.map((p) => p.basicSalary))) +
        f(sumKwdStrings(rows.map((p) => p.allowances)))
      ).toFixed(4),
      commission: sumKwdStrings(rows.map((p) => p.commissionAmount ?? '0')),
      hold: sumKwdStrings(rows.map((p) => p.debtHoldAmount ?? '0')),
      release: sumKwdStrings(rows.map((p) => p.debtReleaseAmount ?? '0')),
      // V19.20 — total scheduled loan instalments booked this month.
      loan: sumKwdStrings(rows.map((p) => p.loanDeduction ?? '0')),
      deductions: sumKwdStrings(rows.map((p) => p.deductions)),
      net: sumKwdStrings(rows.map((p) => payrollNet(p).toFixed(4))),
    };
  }, [payrolls]);

  // V19.17 — release was decoupled from the payroll cycle, so new
  // rows always have `debtReleaseAmount = 0`. Historical rows
  // created before the split may still carry a positive release; in
  // that case we re-expose the column and a totals chip so the
  // numbers on screen reconcile with the Net cell. When nothing has
  // release > 0, we skip the column entirely to keep the grid clean.
  const hasAnyRelease = useMemo(
    () => (payrolls ?? []).some((p) => f(p.debtReleaseAmount) > 0),
    [payrolls],
  );

  // V19.20 — «قسط سلفة» is a first-class payslip band now, so the
  // column is always rendered. Owner feedback: hiding it when the
  // current page has no loans made users think the feature was
  // broken. Empty rows render "—" and the totals chip shows 0.000.
  const hasAnyLoan = true;

  function getBuffer(u: TeamUserRow): EditBuffer {
    const b = buffers[u.id];
    if (b) return b;
    return {
      basic: u.basicMonthlySalary ?? '',
      allow: u.monthlyAllowances ?? '',
      deduct: '0',
    };
  }

  function setBufferValue(
    userId: string,
    field: keyof EditBuffer,
    value: string,
  ) {
    setBuffers((curr) => {
      const user = (users ?? []).find((u) => u.id === userId);
      const base: EditBuffer = curr[userId] ?? {
        basic: user?.basicMonthlySalary ?? '',
        allow: user?.monthlyAllowances ?? '',
        deduct: '0',
      };
      return { ...curr, [userId]: { ...base, [field]: value } };
    });
  }

  function previewNet(u: TeamUserRow): number {
    const b = getBuffer(u);
    return (
      (Number.parseFloat(b.basic) || 0) +
      (Number.parseFloat(b.allow) || 0) -
      (Number.parseFloat(b.deduct) || 0)
    );
  }

  async function saveRow(u: TeamUserRow, silent = false): Promise<boolean> {
    if (!token || !u.branchId) {
      if (!silent) toast.error('الموظف بدون فرع — لا يمكن حفظ المسير');
      return false;
    }
    const buf = getBuffer(u);
    const basic = Number.parseFloat(buf.basic);
    const allow = Number.parseFloat(buf.allow || '0');
    const deduct = Number.parseFloat(buf.deduct || '0');
    if (!Number.isFinite(basic) || basic < 0) {
      if (!silent) toast.error('الراتب الأساسي غير صالح');
      return false;
    }
    if (!Number.isFinite(allow) || allow < 0) {
      if (!silent) toast.error('البدلات غير صالحة');
      return false;
    }
    if (!Number.isFinite(deduct) || deduct < 0) {
      if (!silent) toast.error('الخصم غير صالح');
      return false;
    }
    const { from } = monthRangeIso(month);
    setSavingUserId(u.id);
    try {
      const row = await apiJson<PayrollRow>('/api/payroll', {
        method: 'POST',
        token,
        body: JSON.stringify({
          userId: u.id,
          branchId: u.branchId,
          basicSalary: basic,
          allowances: allow,
          deductions: deduct,
          paymentDate: from,
        }),
      });
      setPayrolls((prev) => [row, ...(prev ?? [])]);

      // Persist the numbers as the user's new defaults so next month
      // starts from the same values without re-typing.
      const needsDefaultUpdate =
        f(u.basicMonthlySalary ?? '0') !== basic ||
        f(u.monthlyAllowances ?? '0') !== allow;
      if (needsDefaultUpdate) {
        try {
          const updated = await updateSalaryDefaults(token, u.id, {
            basicMonthlySalary: basic,
            monthlyAllowances: allow,
          });
          setUsers((prev) =>
            (prev ?? []).map((x) => (x.id === u.id ? updated : x)),
          );
        } catch {
          /* soft-fail — payroll already saved */
        }
      }
      setBuffers((curr) => {
        const { [u.id]: _removed, ...rest } = curr;
        return rest;
      });
      if (!silent) toast.success(`تم حفظ مسير ${u.fullName}`);
      return true;
    } catch (e) {
      if (e instanceof ApiError && !silent) toast.error(e.message);
      return false;
    } finally {
      setSavingUserId(null);
    }
  }

  /**
   * V19.20 — trigger "إعادة حساب القسط" on a PENDING payroll row to
   * pull the scheduled loan instalment in. Idempotent on the server
   * (only touches loans with a NULL high-water mark), so double-
   * clicks are safe. The optimistic state update replaces the row
   * in-place with the response so totals + Net reflect the change
   * without a full reload.
   */
  async function handleRecalcLoan(row: PayrollRow) {
    if (!token) return;
    setRecalcingId(row.id);
    try {
      const updated = await recalcPayrollLoan(token, row.id);
      setPayrolls((prev) =>
        (prev ?? []).map((p) => (p.id === row.id ? updated : p)),
      );
      const added = f(updated.loanDeduction) - f(row.loanDeduction);
      if (added > 0.0005) {
        toast.success(
          `تم حساب قسط السلفة (${added.toFixed(3)} د.ك) لـ ${row.user.fullName}`,
        );
      } else {
        toast.info('لا توجد أقساط متبقية غير محتسبة لهذا الموظف');
      }
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setRecalcingId(null);
    }
  }

  async function handleBulkSaveForBranch(branchId: string) {
    if (!token || !isAdmin) return;
    const eligible = (users ?? []).filter((u) => {
      if (!u.isActive || u.branchId !== branchId) return false;
      if (payrollByUserId.has(u.id)) return false;
      const buf = getBuffer(u);
      const basic = Number.parseFloat(buf.basic);
      return Number.isFinite(basic) && basic > 0;
    });
    if (eligible.length === 0) {
      toast.info('لا يوجد في هذا الفرع مسيرات جاهزة للاعتماد.');
      return;
    }
    setBulkSaving(true);
    let ok = 0;
    let fail = 0;
    for (const u of eligible) {
      const success = await saveRow(u, true);
      if (success) ok += 1;
      else fail += 1;
    }
    setBulkSaving(false);
    if (ok) toast.success(`تم اعتماد ${ok} مسيراً في الفرع`);
    if (fail) toast.error(`تعذّر حفظ ${fail} صف — راجع القيم`);
  }

  async function handleBulkSave() {
    if (!token || !isAdmin) return;
    const eligible = (users ?? []).filter((u) => {
      if (!u.isActive || !u.branchId) return false;
      if (payrollByUserId.has(u.id)) return false;
      const buf = getBuffer(u);
      const basic = Number.parseFloat(buf.basic);
      return Number.isFinite(basic) && basic > 0;
    });
    if (eligible.length === 0) {
      toast.info('لا يوجد موظفون جاهزون للاعتماد — راجع الرواتب.');
      return;
    }
    setBulkSaving(true);
    let ok = 0;
    let fail = 0;
    for (const u of eligible) {
      const success = await saveRow(u, true);
      if (success) ok += 1;
      else fail += 1;
    }
    setBulkSaving(false);
    if (ok) toast.success(`تم اعتماد ${ok} مسير`);
    if (fail) toast.error(`تعذّر حفظ ${fail} صف — راجع القيم`);
  }

  async function handleExport() {
    if (!token) return;
    const { from, to } = monthRangeIso(month);
    try {
      await exportPayrollXlsx(token, { from, to });
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    }
  }

  if (!isAdmin) return <Navigate to="/" replace />;

  const pendingCount = (users ?? []).filter(
    (u) =>
      u.isActive &&
      u.branchId &&
      !payrollByUserId.has(u.id) &&
      f(getBuffer(u).basic) > 0,
  ).length;

  // Human-friendly label of the selected month for the print header.
  const monthLabel = useMemo(() => {
    const [ys, ms] = month.split('-');
    const y = Number.parseInt(ys ?? '0', 10);
    const m = Number.parseInt(ms ?? '0', 10);
    if (!y || !m) return month;
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString('ar-KW', {
      month: 'long',
      year: 'numeric',
    });
  }, [month]);

  return (
    <div className="space-y-4 payroll-unified-root">
      <header
        className="flex flex-wrap items-end justify-between gap-3"
        data-hub-print-hide="true"
      >
        <div className="space-y-1">
          <h2 className="text-xl font-bold">مسير الرواتب الشهري</h2>
          <p className="text-sm text-muted-foreground">
            صفحة واحدة لإدخال واعتماد المسير: تعدّل القيم مباشرة في صف
            الموظف وتضغط حفظ. العمولة والمحجوز يحسبهما النظام تلقائياً.
            تحرير المحجوز يُصرف كإيصال مستقل من تبويب «محجوز المديونية»
            بعد نزول الراتب.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label>الشهر</Label>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-[170px]"
            />
          </div>
          <div className="space-y-1.5 min-w-[200px]">
            <Label>عرض الفرع</Label>
            <Select
              value={branchFilter || '__all__'}
              onValueChange={(v) =>
                setBranchFilter(!v || v === '__all__' ? '' : v)
              }
              disabled={loading || branchGroups.length === 0}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="كل الفروع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">كل الفروع</SelectItem>
                {branchGroups.map(({ branch }) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={loading}>
            <FileSpreadsheet className="me-1 size-4" />
            تصدير Excel
          </Button>
          {/*
            V19.21 — "طباعة المسير الرسمي" opens a dedicated A4 print
            route (brand header + QR stamp + signature boxes) in a new
            tab. It auto-triggers window.print() once data loads, so
            the Owner gets a clean printable roster in two clicks.
          */}
          <Button
            variant="outline"
            onClick={() => {
              const qs = new URLSearchParams({ ym: month });
              window.open(
                `/payroll/roster/print?${qs.toString()}`,
                '_blank',
                'noopener,noreferrer',
              );
            }}
            disabled={loading || (payrolls?.length ?? 0) === 0}
          >
            <Printer className="me-1 size-4" />
            طباعة المسير الرسمي
          </Button>
          <Button
            onClick={handleBulkSave}
            disabled={bulkSaving || loading || pendingCount === 0}
          >
            {bulkSaving ? (
              <Loader2 className="me-1 size-4 animate-spin" />
            ) : (
              <PlayCircle className="me-1 size-4" />
            )}
            {pendingCount > 0
              ? `اعتماد المسير كامل (${pendingCount})`
              : 'المسير مكتمل'}
          </Button>
        </div>
      </header>

      {/*
        Print-only heading shown above totals when the user triggers
        the hub's print button. Hidden on screen (`hidden`) and
        flipped visible inside the printed PDF via `print:flex`.
      */}
      <div className="hidden items-baseline justify-between border-b pb-2 print:flex">
        <div>
          <div className="text-xl font-extrabold">مسير الرواتب الشهري</div>
          <div className="text-sm text-muted-foreground">شهر {monthLabel}</div>
        </div>
        <div className="text-xs text-muted-foreground">
          {new Date().toLocaleDateString('en-GB')}
        </div>
      </div>

      {/* Grand totals */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 pt-4 md:grid-cols-3 xl:grid-cols-6">
          <TotalCell
            label="مسيرات محفوظة"
            value={String(grandTotals.count)}
            tone="neutral"
          />
          <TotalCell
            label="الأساسي + البدلات"
            value={formatKwdLabel(grandTotals.basicAllow)}
            tone="neutral"
          />
          <TotalCell
            label="العمولة"
            value={formatKwdLabel(grandTotals.commission)}
            tone="good"
          />
          {hasAnyRelease && (
            <TotalCell
              label="تحرير محجوز سابق"
              value={formatKwdLabel(grandTotals.release)}
              tone="good"
            />
          )}
          <TotalCell
            label="المحجوز من المديونية"
            value={formatKwdLabel(grandTotals.hold)}
            tone="warn"
          />
          {hasAnyLoan && (
            <TotalCell
              label="قسط السلفة"
              value={formatKwdLabel(grandTotals.loan)}
              tone="warn"
            />
          )}
          <TotalCell
            label="الخصومات"
            value={formatKwdLabel(grandTotals.deductions)}
            tone="warn"
          />
          <TotalCell
            label="الصافي المستحق"
            value={formatKwdLabel(grandTotals.net)}
            tone="good"
            emphasis
          />
        </CardContent>
      </Card>

      {/* Branch sections */}
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : branchGroups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            لا يوجد موظفون مسجّلون.
          </CardContent>
        </Card>
      ) : visibleBranchGroups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            لا يوجد موظفون في الفرع المحدد.
          </CardContent>
        </Card>
      ) : (
        visibleBranchGroups.map(({ branch, users: branchUsers }) => {
          const branchPayrolls = branchUsers
            .map((u) => payrollByUserId.get(u.id))
            .filter((p): p is PayrollRow => !!p);
          const missing = branchUsers.length - branchPayrolls.length;
          const branchPendingSave = branchUsers.filter(
            (u) =>
              !payrollByUserId.has(u.id) &&
              Number.parseFloat(getBuffer(u).basic) > 0,
          ).length;
          const branchNet = sumKwdStrings(
            branchPayrolls.map((p) => payrollNet(p).toFixed(4)),
          );
          return (
            <Card
              key={branch.id}
              id={`payroll-branch-${branch.id}`}
              data-card="branch-payroll"
            >
              <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <Banknote className="size-5 text-primary" />
                  {branch.name}
                  <Badge variant="outline" className="text-xs">
                    {branchUsers.length} موظف
                  </Badge>
                  {missing > 0 ? (
                    <Badge
                      variant="outline"
                      className="border-amber-300 bg-amber-50 text-xs text-amber-700"
                    >
                      <AlertTriangle className="me-1 size-3" />
                      {missing} بانتظار الاعتماد
                    </Badge>
                  ) : (
                    <Badge className="text-xs">
                      <CheckCircle2 className="me-1 size-3" />
                      مكتمل
                    </Badge>
                  )}
                  {branchPendingSave > 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8"
                      disabled={bulkSaving || loading}
                      onClick={() => void handleBulkSaveForBranch(branch.id)}
                    >
                      {bulkSaving ? (
                        <Loader2 className="me-1 size-3.5 animate-spin" />
                      ) : (
                        <PlayCircle className="me-1 size-3.5" />
                      )}
                      اعتماد مسير هذا الفرع ({branchPendingSave})
                    </Button>
                  ) : null}
                </CardTitle>
                <div className="text-sm text-muted-foreground">
                  صافي الفرع:{' '}
                  <span className="font-semibold text-foreground tabular-nums">
                    {formatKwdLabel(branchNet)}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border">
                    <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الموظف</TableHead>
                        <TableHead className="text-end">الأساسي</TableHead>
                        <TableHead className="text-end">البدلات</TableHead>
                        <TableHead className="text-end">الخصم</TableHead>
                        <TableHead className="text-end">العمولة</TableHead>
                        {hasAnyRelease && (
                          <TableHead className="text-end">تحرير</TableHead>
                        )}
                        <TableHead className="text-end">المحجوز</TableHead>
                        {hasAnyLoan && (
                          <TableHead className="text-end">قسط سلفة</TableHead>
                        )}
                        <TableHead className="text-end">الصافي</TableHead>
                        <TableHead
                          className="text-end"
                          data-row-actions="true"
                        >
                          الإجراءات
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {branchUsers.map((u) => {
                        const saved = payrollByUserId.get(u.id);
                        if (saved) {
                          return (
                            <SavedRow
                              key={u.id}
                              user={u}
                              row={saved}
                              heldAmount={heldByUser.get(u.id) ?? 0}
                              showReleaseColumn={hasAnyRelease}
                              showLoanColumn={hasAnyLoan}
                              recalcing={recalcingId === saved.id}
                              onRecalcLoan={() => void handleRecalcLoan(saved)}
                              onOpenHold={() =>
                                setHoldDialogFor({
                                  user: u,
                                  payrollId: saved.id,
                                })
                              }
                            />
                          );
                        }
                        return (
                          <EditableRow
                            key={u.id}
                            user={u}
                            buffer={getBuffer(u)}
                            preview={previewNet(u)}
                            heldAmount={heldByUser.get(u.id) ?? 0}
                            showReleaseColumn={hasAnyRelease}
                            showLoanColumn={hasAnyLoan}
                            saving={savingUserId === u.id || bulkSaving}
                            onChange={(field, value) =>
                              setBufferValue(u.id, field, value)
                            }
                            onSave={() => void saveRow(u)}
                            onOpenHold={() => setHoldDialogFor({ user: u })}
                          />
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      <ManualHoldDialog
        employee={holdDialogFor?.user ?? null}
        payrollId={holdDialogFor?.payrollId}
        onClose={() => setHoldDialogFor(null)}
        onCreated={(row) => {
          const amount = f(row.holdAmount);
          // If the hold was linked to an existing payroll, bump that
          // row's debtHoldAmount + net in place so the grid + totals
          // reflect the new deduction without a reload.
          if (row.payrollId) {
            setPayrolls((prev) =>
              (prev ?? []).map((p) =>
                p.id === row.payrollId
                  ? {
                      ...p,
                      debtHoldAmount: (
                        f(p.debtHoldAmount ?? '0') + amount
                      ).toFixed(4),
                    }
                  : p,
              ),
            );
          } else {
            // Unlinked hold — show it as pending in the heldByUser
            // map so the next payroll save picks it up.
            setHeldByUser((curr) => {
              const next = new Map(curr);
              next.set(
                row.employeeUserId,
                (next.get(row.employeeUserId) ?? 0) + amount,
              );
              return next;
            });
          }
          setHoldDialogFor(null);
        }}
      />
    </div>
  );
}

function SavedRow({
  user,
  row,
  heldAmount,
  showReleaseColumn,
  showLoanColumn,
  recalcing,
  onRecalcLoan,
  onOpenHold,
}: {
  user: TeamUserRow;
  row: PayrollRow;
  heldAmount: number;
  showReleaseColumn: boolean;
  showLoanColumn: boolean;
  recalcing: boolean;
  onRecalcLoan: () => void;
  onOpenHold: () => void;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="font-semibold">{user.fullName}</div>
        <div className="text-xs text-muted-foreground">{user.safariRole}</div>
      </TableCell>
      <TableCell className="text-end tabular-nums">
        {formatKwdLabel(row.basicSalary)}
      </TableCell>
      <TableCell className="text-end tabular-nums">
        {formatKwdLabel(row.allowances)}
      </TableCell>
      <TableCell className="text-end tabular-nums text-rose-600">
        {f(row.deductions) > 0 ? '−' + formatKwdLabel(row.deductions) : '—'}
      </TableCell>
      <TableCell className="text-end tabular-nums text-emerald-600">
        {f(row.commissionAmount) > 0
          ? '+' + formatKwdLabel(row.commissionAmount ?? '0')
          : '—'}
      </TableCell>
      {showReleaseColumn && (
        <TableCell className="text-end tabular-nums text-emerald-600">
          {f(row.debtReleaseAmount) > 0
            ? '+' + formatKwdLabel(row.debtReleaseAmount ?? '0')
            : '—'}
        </TableCell>
      )}
      <TableCell className="text-end tabular-nums text-amber-700">
        {f(row.debtHoldAmount) > 0
          ? '−' + formatKwdLabel(row.debtHoldAmount ?? '0')
          : '—'}
      </TableCell>
      {showLoanColumn && (
        <TableCell className="text-end tabular-nums text-rose-600">
          {f(row.loanDeduction) > 0
            ? '−' + formatKwdLabel(row.loanDeduction ?? '0')
            : '—'}
        </TableCell>
      )}
      <TableCell className="text-end tabular-nums font-bold">
        {formatKwdLabel(payrollNet(row).toFixed(4))}
      </TableCell>
      <TableCell className="text-end" data-row-actions="true">
        <div className="flex flex-wrap justify-end gap-1">
          <Badge className="text-xs">
            <CheckCircle2 className="me-1 size-3" />
            مسجّل
          </Badge>
          {/*
            V19.20 — "إعادة حساب القسط" pulls the scheduled monthly
            instalment into a payroll that was created before the
            loan hook existed. Only shown for PENDING rows; once the
            payroll is PAID the figures are frozen by policy.
          */}
          {row.status === 'PENDING' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onRecalcLoan}
              disabled={recalcing}
              title="إعادة حساب قسط السلفة من الجدول"
            >
              {recalcing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              <span className="ms-1 hidden sm:inline">إعادة حساب القسط</span>
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={onOpenHold}>
            <ShieldAlert className="size-4" />
            <span className="ms-1 hidden sm:inline">حجز يدوي</span>
          </Button>
          {heldAmount > 0 ? (
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-50 tabular-nums text-amber-700"
            >
              {formatKwdLabel(heldAmount.toFixed(4))}
            </Badge>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

function EditableRow({
  user,
  buffer,
  preview,
  heldAmount,
  showReleaseColumn,
  showLoanColumn,
  saving,
  onChange,
  onSave,
  onOpenHold,
}: {
  user: TeamUserRow;
  buffer: EditBuffer;
  preview: number;
  heldAmount: number;
  showReleaseColumn: boolean;
  showLoanColumn: boolean;
  saving: boolean;
  onChange: (field: keyof EditBuffer, value: string) => void;
  onSave: () => void;
  onOpenHold: () => void;
}) {
  return (
    <TableRow className="bg-muted/10">
      <TableCell>
        <div className="font-semibold">{user.fullName}</div>
        <div className="text-xs text-muted-foreground">{user.safariRole}</div>
      </TableCell>
      <TableCell className="text-end">
        <Input
          type="number"
          step="0.001"
          min="0"
          value={buffer.basic}
          onChange={(e) => onChange('basic', e.target.value)}
          className="w-[120px] text-end"
          placeholder="0.000"
          disabled={saving}
        />
      </TableCell>
      <TableCell className="text-end">
        <Input
          type="number"
          step="0.001"
          min="0"
          value={buffer.allow}
          onChange={(e) => onChange('allow', e.target.value)}
          className="w-[110px] text-end"
          placeholder="0.000"
          disabled={saving}
        />
      </TableCell>
      <TableCell className="text-end">
        <Input
          type="number"
          step="0.001"
          min="0"
          value={buffer.deduct}
          onChange={(e) => onChange('deduct', e.target.value)}
          className="w-[110px] text-end"
          placeholder="0.000"
          disabled={saving}
        />
      </TableCell>
      <TableCell className="payroll-auto-cell text-end text-xs text-muted-foreground">
        تلقائي
      </TableCell>
      {showReleaseColumn && (
        <TableCell className="payroll-auto-cell text-end text-xs text-muted-foreground">
          تلقائي
        </TableCell>
      )}
      <TableCell className="payroll-auto-cell text-end text-xs text-muted-foreground">
        تلقائي
      </TableCell>
      {showLoanColumn && (
        <TableCell className="payroll-auto-cell text-end text-xs text-muted-foreground">
          تلقائي
        </TableCell>
      )}
      <TableCell className="text-end tabular-nums font-bold">
        {formatKwdLabel(preview.toFixed(4))}
        <div className="payroll-preview-note text-xs font-normal text-muted-foreground">
          قبل الحساب
        </div>
      </TableCell>
      <TableCell className="text-end" data-row-actions="true">
        <div className="flex flex-wrap justify-end gap-1">
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            <span className="ms-1 hidden sm:inline">حفظ</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenHold}
            disabled={saving}
          >
            <ShieldAlert className="size-4" />
            <span className="ms-1 hidden sm:inline">حجز يدوي</span>
          </Button>
          {heldAmount > 0 ? (
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-50 tabular-nums text-amber-700"
            >
              {formatKwdLabel(heldAmount.toFixed(4))}
            </Badge>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

function TotalCell({
  label,
  value,
  tone,
  emphasis,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'good' | 'warn';
  emphasis?: boolean;
}) {
  const toneCls =
    tone === 'good'
      ? 'text-emerald-600'
      : tone === 'warn'
      ? 'text-amber-700'
      : 'text-foreground';
  return (
    <div
      className={`rounded-lg border p-3 ${
        emphasis ? 'border-primary/40 bg-primary/5' : ''
      }`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${toneCls}`}>
        {value}
      </div>
    </div>
  );
}

function ManualHoldDialog({
  employee,
  payrollId,
  onClose,
  onCreated,
}: {
  employee: TeamUserRow | null;
  payrollId?: string;
  onClose: () => void;
  onCreated: (row: DebtHoldRow) => void;
}) {
  const { token } = useAuth();
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (employee) {
      setAmount('');
      setNote('');
    }
  }, [employee]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!employee || !token) return;
    const n = Number.parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('أدخل مبلغ حجز صحيح أكبر من صفر');
      return;
    }
    setSaving(true);
    try {
      const row = await createManualDebtHold(token, {
        employeeUserId: employee.id,
        holdAmount: n,
        note: note.trim() || undefined,
        payrollId,
      });
      toast.success(
        payrollId
          ? 'تم إنشاء المحجوز وخصمه من الصافي مباشرةً'
          : 'تم إنشاء المحجوز — سيُستوعب في أول مسير للموظف',
      );
      onCreated(row);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!employee} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-amber-600" />
            حجز يدوي على راتب {employee?.fullName}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg border bg-amber-50/60 p-3 text-xs text-amber-800">
            <BadgeDollarSign className="me-1 inline size-4" />
            {payrollId
              ? 'سيُضاف الحجز مباشرةً إلى خانة «المحجوز» في مسير هذا الشهر ويخصم من الصافي فوراً.'
              : 'الحجز يُستوعب في أول مسير للموظف وينقص من صافي الراتب، ويُحرَّر لاحقاً من تبويب «محجوز المديونية».'}
          </div>
          <div className="space-y-1.5">
            <Label>المبلغ (د.ك)</Label>
            <Input
              type="number"
              step="0.001"
              min="0.001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="مثال: 25.000"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>ملاحظة (اختياري)</Label>
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="سلفة نقدية بتاريخ 2026-04-20"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              إلغاء
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="me-2 size-4 animate-spin" />
              ) : (
                <Plus className="me-2 size-4" />
              )}
              إنشاء الحجز
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default PayrollUnifiedPage;
