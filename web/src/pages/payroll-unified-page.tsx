import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
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
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  apiJson,
  createManualDebtHold,
  createPayrollAdhocLine,
  deletePayrollAdhocLine,
  exportPayrollXlsx,
  listDebtHolds,
  listPayrollAdhocLines,
  recalcPayrollLoan,
  updatePayrollAdhocLine,
  updateSalaryDefaults,
  type BranchRow,
  type DebtHoldRow,
  type PayrollAdHocLineRow,
  type PayrollRow,
  type TeamUserRow,
} from '@/lib/api';
import {
  compareBranchesForPayrollRoster,
  compareTeamUsersForPayrollRoster,
} from '@/lib/payroll-roster-sort';
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

/** V19.27 — Parse manual roster / bank fields for PATCH salary-defaults. */
function rosterBankExtrasPayload(d: {
  rosterOrder: string;
  bankIban: string;
  bankName: string;
}):
  | {
      ok: true;
      body: {
        payrollRosterLineOrder: number | null;
        bankIban: string | null;
        bankName: string | null;
      };
    }
  | { ok: false; message: string } {
  const sortRaw = d.rosterOrder.trim();
  let payrollRosterLineOrder: number | null;
  if (sortRaw === '') {
    payrollRosterLineOrder = null;
  } else {
    const n = Number.parseInt(sortRaw, 10);
    if (!Number.isFinite(n) || n < 1) {
      return {
        ok: false,
        message: 'ترتيب المسيرة: أدخل رقماً صحيحاً أو اتركه فارغاً',
      };
    }
    payrollRosterLineOrder = n;
  }
  const bankIban = d.bankIban.replace(/\s/g, '').trim() || null;
  const bankName = d.bankName.trim() || null;
  return { ok: true, body: { payrollRosterLineOrder, bankIban, bankName } };
}

function rosterExtrasMatchesUser(
  u: TeamUserRow,
  b: {
    payrollRosterLineOrder: number | null;
    bankIban: string | null;
    bankName: string | null;
  },
): boolean {
  if ((u.payrollRosterLineOrder ?? null) !== (b.payrollRosterLineOrder ?? null)) {
    return false;
  }
  const ibanU = (u.bankIban ?? '').replace(/\s/g, '').trim();
  const ibanB = (b.bankIban ?? '').replace(/\s/g, '').trim();
  if (ibanU !== ibanB) return false;
  if ((u.bankName ?? '').trim() !== (b.bankName ?? '').trim()) return false;
  return true;
}

function readYmFromSearch(sp: URLSearchParams): string | null {
  const ym = sp.get('ym');
  if (ym && /^\d{4}-\d{2}$/.test(ym)) return ym;
  const legacyM = sp.get('m');
  if (legacyM && /^\d{4}-\d{2}$/.test(legacyM)) return legacyM;
  return null;
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
  /** Same roles as `POST /payroll` — was OWNER/GM only in UI and hid the grid from MANAGER. */
  const isAdmin = hasRole('OWNER', 'GENERAL_MANAGER', 'MANAGER');

  // V19.22 — keep the selected month in the URL (?ym=YYYY-MM) so the
  // Staff Hub print button can read it and open the dedicated roster
  // route on the exact month the user is looking at, and so the
  // month is bookmarkable / restorable on refresh.
  const [searchParams, setSearchParams] = useSearchParams();
  const [month, setMonth] = useState(() => {
    const fromUrl = readYmFromSearch(searchParams);
    if (fromUrl) return fromUrl;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  /** Normalize `?m=YYYY-MM` → `?ym=` (Bookmarks / old links). */
  useEffect(() => {
    const canonical = readYmFromSearch(searchParams);
    if (searchParams.get('m') && canonical) {
      const next = new URLSearchParams(searchParams);
      next.set('ym', canonical);
      next.delete('m');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  /** Keep month in sync when `ym` changes in the URL (e.g. back/forward). */
  useEffect(() => {
    const ymOnly = searchParams.get('ym');
    if (!ymOnly || !/^\d{4}-\d{2}$/.test(ymOnly)) return;
    setMonth((prev) => (prev === ymOnly ? prev : ymOnly));
  }, [searchParams]);

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

  /** V19.27 — Manual payroll roster order + bank account (per user). */
  const [rosterBankDraft, setRosterBankDraft] = useState<
    Record<
      string,
      { rosterOrder: string; bankIban: string; bankName: string }
    >
  >({});
  const [savingRosterExtraId, setSavingRosterExtraId] = useState<string | null>(
    null,
  );

  /** V19.28 — مسير lines without a User (external payee + IBAN). */
  const [adhocLines, setAdhocLines] = useState<PayrollAdHocLineRow[]>([]);
  const [adhocCreateForBranchId, setAdhocCreateForBranchId] = useState<
    string | null
  >(null);

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
      const [p, u, b, h, ad] = await Promise.all([
        apiJson<PayrollRow[]>(`/api/payroll?${qs.toString()}`, { token }),
        apiJson<TeamUserRow[]>('/api/users', { token }),
        apiJson<BranchRow[]>('/api/branches', { token }),
        listDebtHolds(token, { status: 'HELD' }),
        listPayrollAdhocLines(token, month),
      ]);
      setPayrolls(Array.isArray(p) ? p : []);
      setUsers(Array.isArray(u) ? u : []);
      setBranches(Array.isArray(b) ? b : []);
      setAdhocLines(Array.isArray(ad) ? ad : []);
      const heldMap = new Map<string, number>();
      for (const row of Array.isArray(h) ? h : []) {
        heldMap.set(
          row.employeeUserId,
          (heldMap.get(row.employeeUserId) ?? 0) + f(row.holdAmount),
        );
      }
      setHeldByUser(heldMap);
      setBuffers({});
      setRosterBankDraft({});
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

  const branchesByIdMap = useMemo(
    () => new Map((branches ?? []).map((b) => [b.id, b])),
    [branches],
  );

  /**
   * «عرض الفرع» must list every active branch from the registry — not only
   * branches that already have staff rows this month (branchGroups). Otherwise
   * owners see seven branches in إدارة الفروع but only one option here.
   */
  const branchSelectOptions = useMemo(() => {
    const activeStaffByKey = new Map<string, number>();
    for (const u of (users ?? []).filter((x) => x.isActive)) {
      const k = u.branchId ?? '__unassigned__';
      activeStaffByKey.set(k, (activeStaffByKey.get(k) ?? 0) + 1);
    }
    const sorted = (branches ?? [])
      .filter((b) => b.isActive)
      .slice()
      .sort((a, b) =>
        compareBranchesForPayrollRoster(
          {
            name: a.name,
            payrollRosterSortOrder: a.payrollRosterSortOrder,
          },
          {
            name: b.name,
            payrollRosterSortOrder: b.payrollRosterSortOrder,
          },
        ),
      )
      .map((b) => ({
        id: b.id,
        name: b.name,
        activeStaffCount: activeStaffByKey.get(b.id) ?? 0,
      }));
    const listed = new Set(sorted.map((o) => o.id));
    const orphans: { id: string; name: string; activeStaffCount: number }[] =
      [];
    for (const branchId of activeStaffByKey.keys()) {
      if (branchId === '__unassigned__' || listed.has(branchId)) continue;
      const sample = (users ?? []).find(
        (x) => x.isActive && x.branchId === branchId,
      );
      orphans.push({
        id: branchId,
        name: sample?.branch?.name ?? 'فرع غير مدرج في القائمة',
        activeStaffCount: activeStaffByKey.get(branchId) ?? 0,
      });
    }
    orphans.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    const hasUnassigned = (users ?? []).some(
      (x) => x.isActive && !x.branchId,
    );
    const tail = hasUnassigned
      ? [
          {
            id: '__unassigned__',
            name: 'بدون فرع',
            activeStaffCount: activeStaffByKey.get('__unassigned__') ?? 0,
          },
        ]
      : [];
    return [...sorted, ...orphans, ...tail];
  }, [branches, users]);

  /** If `branchFilter` is stale (unknown id), Base UI shows the raw value (UUID) in the trigger. */
  useEffect(() => {
    if (loading) return;
    if (!branchFilter) return;
    const valid = branchSelectOptions.some((o) => o.id === branchFilter);
    if (!valid) setBranchFilter('');
  }, [loading, branchFilter, branchSelectOptions]);

  const branchFilterTriggerLabel = useMemo(() => {
    if (!branchFilter) return '';
    const o = branchSelectOptions.find((x) => x.id === branchFilter);
    if (o) return `${o.name} (${o.activeStaffCount})`;
    return branchesByIdMap.get(branchFilter)?.name ?? '';
  }, [branchFilter, branchSelectOptions, branchesByIdMap]);

  const branchGroups = useMemo(() => {
    const branchesById = branchesByIdMap;
    const groups = new Map<string, { branch: BranchRow; users: TeamUserRow[] }>();
    for (const u of (users ?? []).filter((x) => x.isActive)) {
      const key = u.branchId ?? '__unassigned__';
      let branch: BranchRow;
      if (!u.branchId) {
        branch = {
          id: '__unassigned__',
          name: 'بدون فرع',
          location: '',
          phone: '',
          isActive: true,
          isAdministrative: false,
          updatedAt: '',
        } as BranchRow;
      } else {
        const row = branchesById.get(u.branchId);
        if (row) {
          branch = row;
        } else {
          // branchId لا يظهر في قائمة الفروع (فرع محذوف، أو غير مرئي للدور الحالي):
          // يجب أن يبقى g.branch.id === key وإلا يفشل تصفية «عرض الفرع».
          branch = {
            id: u.branchId,
            name: u.branch?.name ?? 'فرع غير مدرج في القائمة',
            location: u.branch?.location ?? '',
            phone: null,
            isActive: true,
            isAdministrative: false,
            updatedAt: '',
          } as BranchRow;
        }
      }
      const bucket = groups.get(key) ?? { branch, users: [] };
      bucket.users.push(u);
      groups.set(key, bucket);
    }
    return Array.from(groups.values())
      .sort((a, b) =>
        compareBranchesForPayrollRoster(
          {
            name: a.branch.name,
            payrollRosterSortOrder: a.branch.payrollRosterSortOrder,
          },
          {
            name: b.branch.name,
            payrollRosterSortOrder: b.branch.payrollRosterSortOrder,
          },
        ),
      )
      .map((g) => ({
        branch: g.branch,
        users: g.users.sort(compareTeamUsersForPayrollRoster),
      }));
  }, [users, branchesByIdMap]);

  const visibleBranchGroups = useMemo(() => {
    if (!branchFilter) return branchGroups;
    return branchGroups.filter((g) => g.branch.id === branchFilter);
  }, [branchGroups, branchFilter]);

  /**
   * DB reality check: if every active `User.branchId` is the same while the
   * registry lists many branches, dropdown counts will be (0) everywhere
   * except that one branch — not a UI bug.
   */
  const payrollSingleBranchDataNotice = useMemo(() => {
    if (loading) return null;
    const active = (users ?? []).filter((u) => u.isActive);
    const withBranch = active.filter((u) => u.branchId);
    const distinctIds = new Set(
      withBranch.map((u) => u.branchId as string),
    );
    const registryActive = (branches ?? []).filter((b) => b.isActive).length;
    if (withBranch.length === 0 || registryActive < 2) return null;
    if (distinctIds.size !== 1) return null;
    const onlyId = [...distinctIds][0]!;
    const branchName = branchesByIdMap.get(onlyId)?.name ?? 'فرع واحد';
    return { staff: withBranch.length, branchName };
  }, [loading, users, branches, branchesByIdMap]);

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

  function getRosterBankDraft(u: TeamUserRow): {
    rosterOrder: string;
    bankIban: string;
    bankName: string;
  } {
    const d = rosterBankDraft[u.id];
    if (d) return d;
    return {
      rosterOrder:
        u.payrollRosterLineOrder != null ? String(u.payrollRosterLineOrder) : '',
      bankIban: u.bankIban ?? '',
      bankName: u.bankName ?? '',
    };
  }

  function setRosterBankDraftField(
    userId: string,
    patch: Partial<{
      rosterOrder: string;
      bankIban: string;
      bankName: string;
    }>,
  ) {
    setRosterBankDraft((prev) => {
      const row = (users ?? []).find((x) => x.id === userId);
      const base =
        prev[userId] ??
        (row
          ? {
              rosterOrder:
                row.payrollRosterLineOrder != null
                  ? String(row.payrollRosterLineOrder)
                  : '',
              bankIban: row.bankIban ?? '',
              bankName: row.bankName ?? '',
            }
          : { rosterOrder: '', bankIban: '', bankName: '' });
      return { ...prev, [userId]: { ...base, ...patch } };
    });
  }

  async function saveRosterBankExtras(u: TeamUserRow) {
    if (!token) return;
    const parsed = rosterBankExtrasPayload(getRosterBankDraft(u));
    if (!parsed.ok) {
      toast.error(parsed.message);
      return;
    }
    setSavingRosterExtraId(u.id);
    try {
      const updated = await updateSalaryDefaults(token, u.id, parsed.body);
      setUsers((prev) =>
        (prev ?? []).map((x) => (x.id === u.id ? updated : x)),
      );
      setRosterBankDraft((prev) => {
        const { [u.id]: _, ...rest } = prev;
        return rest;
      });
      toast.success('تم حفظ رقم الحساب');
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSavingRosterExtraId(null);
    }
  }

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
    const extrasParsed = rosterBankExtrasPayload(getRosterBankDraft(u));
    if (!extrasParsed.ok) {
      if (!silent) toast.error(extrasParsed.message);
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

      // Defaults + roster/bank extras: one PATCH so المسيرة والحساب stay in sync.
      try {
        const updated = await updateSalaryDefaults(token, u.id, {
          basicMonthlySalary: basic,
          monthlyAllowances: allow,
          ...extrasParsed.body,
        });
        setUsers((prev) =>
          (prev ?? []).map((x) => (x.id === u.id ? updated : x)),
        );
      } catch {
        /* soft-fail — payroll already saved */
      }
      setBuffers((curr) => {
        const { [u.id]: _removed, ...rest } = curr;
        return rest;
      });
      setRosterBankDraft((curr) => {
        const { [u.id]: _r, ...rest } = curr;
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
        <div className="space-y-2">
          <h2 className="text-xl font-bold">مسير الرواتب الشهري</h2>
          <p className="text-sm text-muted-foreground">
            صفحة واحدة لإدخال واعتماد المسير: تعدّل القيم مباشرة في صف
            الموظف وتضغط حفظ. العمولة والمحجوز يحسبهما النظام تلقائياً.
            تحرير المحجوز يُصرف كإيصال مستقل من تبويب «محجوز المديونية»
            بعد نزول الراتب.
          </p>
          <p className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-foreground">
            <span className="font-semibold">رقم الحساب:</span> يُحدَّث في العمود
            أدناه (رقم محلي دون رمز دولة مثل KW)؛ بعد تعديل الصف المسجّل اضغط خارج
            الحقل ليُحفظ. وزر{' '}
            <span className="font-semibold">سطر يدوي</span> لإضافة مستفيد خارج
            النظام لنفس شهر المسير.
          </p>
          {payrollSingleBranchDataNotice ? (
            <p
              className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-foreground"
              data-payroll-data-notice="single-branch"
            >
              <span className="font-semibold">فحص البيانات:</span> كل الموظفين
              النشطين في النظام ({payrollSingleBranchDataNotice.staff}) مربوطون
              حالياً بفرع واحد فقط: «
              {payrollSingleBranchDataNotice.branchName}». لذلك يظهر العدد
              بجانب بقية الفروع صفراً — مسير الرواتب يعتمد على{' '}
              <span className="font-medium">حقل الفرع في حساب المستخدم</span>،
              وليس على أسماء الفروع في التشغيل فقط. لتوزيع الفريق: عدّل الفرع من
              لوحة المالك أو شغّل سكربت التعيين الجماعي إن وُجد.
            </p>
          ) : null}
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
              disabled={loading || branchSelectOptions.length === 0}
            >
              <SelectTrigger className="min-w-[220px] max-w-[min(100%,320px)]">
                <SelectValue placeholder="كل الفروع">
                  {branchFilter && branchFilterTriggerLabel
                    ? branchFilterTriggerLabel
                    : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">كل الفروع</SelectItem>
                {branchSelectOptions.map(
                  ({ id, name, activeStaffCount }) => (
                    <SelectItem key={id} value={id}>
                      {`${name} (${activeStaffCount})`}
                    </SelectItem>
                  ),
                )}
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
          <CardContent className="space-y-2 py-10 text-center text-muted-foreground">
            <p>
              لا يوجد موظفون نشطون مربوطون بهذا الفرع في{' '}
              <span className="font-medium text-foreground">حقل الفرع</span> داخل
              حساب المستخدم.
            </p>
            <p className="text-sm">
              إن وُجد موظفون تحت «كل الفروع» لكن لا يظهرون هنا، فغالباً فرعهم
              في الملف مختلف عن الفرع التشغيلي — عدّل التعيين من لوحة المالك /
              تعديل المستخدم.
            </p>
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 border-dashed border-amber-600/50 text-amber-900 dark:text-amber-200"
                    disabled={loading || bulkSaving}
                    onClick={() => setAdhocCreateForBranchId(branch.id)}
                  >
                    <Plus className="me-1 size-3.5" />
                    سطر يدوي
                  </Button>
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
                    <Table className="min-w-[1040px] table-auto">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[9rem] whitespace-normal">
                          الموظف
                        </TableHead>
                        <TableHead className="min-w-[12rem] max-w-[20rem] whitespace-normal">
                          رقم الحساب
                        </TableHead>
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
                        const extrasSaving =
                          savingRosterExtraId === u.id ||
                          savingUserId === u.id ||
                          bulkSaving;
                        const rosterExtras = (
                          <PayrollRosterBankBlock
                            draft={getRosterBankDraft(u)}
                            disabled={extrasSaving}
                            onDraftChange={(patch) =>
                              setRosterBankDraftField(u.id, patch)
                            }
                            onBlurPersist={() => {
                              const d = getRosterBankDraft(u);
                              const p = rosterBankExtrasPayload(d);
                              if (!p.ok) {
                                toast.error(p.message);
                                return;
                              }
                              if (rosterExtrasMatchesUser(u, p.body)) return;
                              void saveRosterBankExtras(u);
                            }}
                          />
                        );
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
                              rosterExtras={rosterExtras}
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
                            rosterExtras={rosterExtras}
                          />
                        );
                      })}
                      {adhocLines
                        .filter(
                          (l) =>
                            l.branchId === branch.id && l.periodYm === month,
                        )
                        .sort(
                          (a, b) =>
                            a.lineSort - b.lineSort ||
                            a.createdAt.localeCompare(b.createdAt),
                        )
                        .map((line) => (
                          <AdhocPayrollLineRow
                            key={line.id}
                            line={line}
                            token={token}
                            showReleaseColumn={hasAnyRelease}
                            showLoanColumn={hasAnyLoan}
                            savingGlobal={bulkSaving}
                            onReload={() => void loadAll()}
                          />
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      <AdhocManualCreateDialog
        open={adhocCreateForBranchId !== null}
        branchId={adhocCreateForBranchId ?? ''}
        branchName={
          adhocCreateForBranchId ?
            branchesByIdMap.get(adhocCreateForBranchId)?.name ?? ''
          : ''
        }
        month={month}
        token={token}
        onClose={() => setAdhocCreateForBranchId(null)}
        onCreated={() => void loadAll()}
      />

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

function AdhocPayrollLineRow({
  line,
  token,
  showReleaseColumn,
  showLoanColumn,
  savingGlobal,
  onReload,
}: {
  line: PayrollAdHocLineRow;
  token: string | null;
  showReleaseColumn: boolean;
  showLoanColumn: boolean;
  savingGlobal: boolean;
  onReload: () => void;
}) {
  const [name, setName] = useState(line.beneficiaryName);
  const [bankName, setBankName] = useState(line.bankName ?? '');
  const [iban, setIban] = useState(line.bankIban ?? '');
  const [sort, setSort] = useState(String(line.lineSort));
  const [basic, setBasic] = useState(line.basicSalary);
  const [allow, setAllow] = useState(line.allowances);
  const [deduct, setDeduct] = useState(line.deductions);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(line.beneficiaryName);
    setBankName(line.bankName ?? '');
    setIban(line.bankIban ?? '');
    setSort(String(line.lineSort));
    setBasic(line.basicSalary);
    setAllow(line.allowances);
    setDeduct(line.deductions);
  }, [line]);

  const preview =
    (Number.parseFloat(basic) || 0) +
    (Number.parseFloat(allow) || 0) -
    (Number.parseFloat(deduct) || 0);

  async function save() {
    if (!token) return;
    const sortN = Number.parseInt(sort, 10);
    if (!Number.isFinite(sortN)) {
      toast.error('ترتيب السطر: رقم صحيح');
      return;
    }
    setSaving(true);
    try {
      await updatePayrollAdhocLine(token, line.id, {
        beneficiaryName: name.trim(),
        bankName: bankName.trim() || null,
        bankIban: iban.replace(/\s/g, '').trim() || null,
        lineSort: sortN,
        basicSalary: Number.parseFloat(basic) || 0,
        allowances: Number.parseFloat(allow) || 0,
        deductions: Number.parseFloat(deduct) || 0,
      });
      toast.success('تم حفظ السطر اليدوي');
      onReload();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!token) return;
    if (!window.confirm('حذف هذا السطر من المسير؟')) return;
    try {
      await deletePayrollAdhocLine(token, line.id);
      toast.success('تم الحذف');
      onReload();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    }
  }

  const dis = saving || savingGlobal;

  return (
    <TableRow className="border-amber-200/80 bg-amber-50/40 dark:bg-amber-950/25">
      <TableCell className="align-top whitespace-normal">
        <div className="mb-1 flex flex-wrap items-center gap-1">
          <Badge variant="secondary" className="text-[10px]">
            سطر يدوي
          </Badge>
        </div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 font-semibold"
          disabled={dis}
          placeholder="اسم المستفيد"
        />
      </TableCell>
      <TableCell className="align-top whitespace-normal">
        <div className="space-y-1">
          <Input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            className="h-8"
            placeholder="البنك"
            disabled={dis}
          />
          <div className="flex flex-wrap items-end gap-2">
            <Input
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              dir="ltr"
              className="h-8 min-w-[10rem] flex-1 font-mono text-start"
              disabled={dis}
              spellCheck={false}
            />
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">
                ترتيب
              </Label>
              <Input
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="h-8 w-14"
                inputMode="numeric"
                disabled={dis}
              />
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-end">
        <Input
          type="number"
          step="0.001"
          min="0"
          value={basic}
          onChange={(e) => setBasic(e.target.value)}
          className="w-[120px] text-end"
          disabled={dis}
        />
      </TableCell>
      <TableCell className="text-end">
        <Input
          type="number"
          step="0.001"
          min="0"
          value={allow}
          onChange={(e) => setAllow(e.target.value)}
          className="w-[110px] text-end"
          disabled={dis}
        />
      </TableCell>
      <TableCell className="text-end">
        <Input
          type="number"
          step="0.001"
          min="0"
          value={deduct}
          onChange={(e) => setDeduct(e.target.value)}
          className="w-[110px] text-end"
          disabled={dis}
        />
      </TableCell>
      <TableCell className="payroll-auto-cell text-end text-xs text-muted-foreground">
        —
      </TableCell>
      {showReleaseColumn && (
        <TableCell className="payroll-auto-cell text-end text-xs text-muted-foreground">
          —
        </TableCell>
      )}
      <TableCell className="payroll-auto-cell text-end text-xs text-muted-foreground">
        —
      </TableCell>
      {showLoanColumn && (
        <TableCell className="payroll-auto-cell text-end text-xs text-muted-foreground">
          —
        </TableCell>
      )}
      <TableCell className="text-end tabular-nums font-medium">
        {formatKwdLabel(preview.toFixed(4))}
      </TableCell>
      <TableCell className="text-end" data-row-actions="true">
        <div className="flex flex-wrap justify-end gap-1">
          <Button type="button" size="sm" variant="secondary" disabled={dis} onClick={() => void save()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-destructive"
            disabled={dis}
            onClick={() => void remove()}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function AdhocManualCreateDialog({
  open,
  branchId,
  branchName,
  month,
  token,
  onClose,
  onCreated,
}: {
  open: boolean;
  branchId: string;
  branchName: string;
  month: string;
  token: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [bankName, setBankName] = useState('');
  const [iban, setIban] = useState('');
  const [basic, setBasic] = useState('0');
  const [allow, setAllow] = useState('0');
  const [deduct, setDeduct] = useState('0');
  const [sort, setSort] = useState('0');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setBankName('');
      setIban('');
      setBasic('0');
      setAllow('0');
      setDeduct('0');
      setSort('0');
    }
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token || !branchId) return;
    if (!name.trim()) {
      toast.error('أدخل اسم المستفيد');
      return;
    }
    setSaving(true);
    try {
      await createPayrollAdhocLine(token, {
        branchId,
        periodYm: month,
        beneficiaryName: name.trim(),
        bankName: bankName.trim() || null,
        bankIban: iban.replace(/\s/g, '').trim() || null,
        basicSalary: Number.parseFloat(basic) || 0,
        allowances: Number.parseFloat(allow) || 0,
        deductions: Number.parseFloat(deduct) || 0,
        lineSort: Number.parseInt(sort, 10) || 0,
      });
      toast.success('تمت إضافة السطر اليدوي');
      onCreated();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            إضافة سطر يدوي — {branchName || 'الفرع'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label>اسم المستفيد</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={saving}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>البنك</Label>
              <Input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <Label>ترتيب الظهور</Label>
              <Input
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                inputMode="numeric"
                disabled={saving}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>رقم الحساب</Label>
            <Input
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              dir="ltr"
              className="font-mono"
              disabled={saving}
              spellCheck={false}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label>أساسي</Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                value={basic}
                onChange={(e) => setBasic(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <Label>بدلات</Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                value={allow}
                onChange={(e) => setAllow(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <Label>خصم</Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                value={deduct}
                onChange={(e) => setDeduct(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            الشهر الحالي للمسير: {month} — لا يُربط السطر بمستخدم في النظام.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              إلغاء
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              حفظ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Bank account # (local digits ok; no country prefix required in UI). */
function PayrollRosterBankBlock({
  draft,
  disabled,
  onDraftChange,
  onBlurPersist,
}: {
  draft: {
    rosterOrder: string;
    bankIban: string;
    bankName: string;
  };
  disabled: boolean;
  onDraftChange: (
    patch: Partial<{
      rosterOrder: string;
      bankIban: string;
      bankName: string;
    }>,
  ) => void;
  onBlurPersist: () => void;
}) {
  return (
    <Input
      data-payroll-roster-extras="true"
      value={draft.bankIban}
      onChange={(e) => onDraftChange({ bankIban: e.target.value })}
      onBlur={() => onBlurPersist()}
      dir="ltr"
      className="h-8 min-w-[10rem] max-w-[20rem] font-mono text-start"
      disabled={disabled}
      spellCheck={false}
      aria-label="رقم الحساب"
    />
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
  rosterExtras,
}: {
  user: TeamUserRow;
  row: PayrollRow;
  heldAmount: number;
  showReleaseColumn: boolean;
  showLoanColumn: boolean;
  recalcing: boolean;
  onRecalcLoan: () => void;
  onOpenHold: () => void;
  rosterExtras: ReactNode;
}) {
  return (
    <TableRow>
      <TableCell className="align-top whitespace-normal">
        <div className="font-semibold">{user.fullName}</div>
        <div className="text-xs text-muted-foreground">{user.safariRole}</div>
      </TableCell>
      <TableCell className="align-top whitespace-normal">
        {rosterExtras}
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
  rosterExtras,
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
  rosterExtras: ReactNode;
}) {
  return (
    <TableRow className="bg-muted/10">
      <TableCell className="align-top whitespace-normal">
        <div className="font-semibold">{user.fullName}</div>
        <div className="text-xs text-muted-foreground">{user.safariRole}</div>
      </TableCell>
      <TableCell className="align-top whitespace-normal">
        {rosterExtras}
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
