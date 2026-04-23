import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Banknote, Loader2, Printer, Undo2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { BRAND } from '@/lib/brand';
import { DocumentQR } from '@/modules/shared/print/DocumentQR';
import {
  ApiError,
  type DebtHoldRow,
  type TeamUserRow,
  apiJson,
  disburseDebtHold,
  listDebtHolds,
  releaseDebtHold,
} from '@/lib/api';
import { Badge } from '@/modules/shared/components/ui/badge';
import { Button } from '@/modules/shared/components/ui/button';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';

function monthRangeIso(ym: string): { from: string; to: string } {
  const [ys, ms] = ym.split('-');
  const y = Number.parseInt(ys ?? '0', 10);
  const m = Number.parseInt(ms ?? '1', 10);
  const from = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const to = new Date(y, m, 0, 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatKd(v: string): string {
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString('en-GB', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

/**
 * V19.17 — auto-print voucher rendered off-screen whenever the user
 * triggers «تحرير» or «صرف» on a hold. The voucher is hidden on the
 * screen via `#debt-hold-voucher-root { display: none }` and surfaces
 * only inside the print window (see index.css). Because release and
 * disbursement are standalone events decoupled from the monthly
 * payroll, each action must hand the employee a signed voucher — this
 * is that voucher, generated and printed automatically the moment the
 * backend confirms the state transition.
 */
type VoucherKind = 'RELEASE' | 'DISBURSE';

function DebtHoldVoucher({
  hold,
  kind,
}: {
  hold: DebtHoldRow;
  kind: VoucherKind;
}) {
  const title =
    kind === 'RELEASE'
      ? 'إيصال تحرير محجوز مديونية'
      : 'إيصال صرف محجوز مديونية';
  const subtitle =
    kind === 'RELEASE'
      ? 'تحرير المبلغ عقب تحصيل المديونية — لم يُصرف للموظف بعد'
      : 'صرف المبلغ المحرَّر نقداً/حوالة للموظف';
  const refDate =
    kind === 'RELEASE'
      ? hold.releaseDate ?? new Date().toISOString()
      : hold.disbursedAt ?? new Date().toISOString();
  const amount = kind === 'RELEASE' ? hold.holdAmount : hold.releasedAmount;
  const now = new Date();
  return (
    <div id="debt-hold-voucher-root" aria-hidden="true">
      <article className="voucher-sheet">
        <header className="voucher-header">
          <div>
            <div className="voucher-brand">{BRAND.customerAr}</div>
            <div className="voucher-brand-sub">{BRAND.systemAr}</div>
          </div>
          <div className="voucher-title-block">
            <div className="voucher-title">{title}</div>
            <div className="voucher-subtitle">{subtitle}</div>
          </div>
        </header>

        <section className="voucher-meta">
          <div>
            <span>رقم المستند:</span>
            <strong>{hold.id.slice(0, 8).toUpperCase()}</strong>
          </div>
          <div>
            <span>تاريخ الإصدار:</span>
            <strong>{now.toLocaleString('en-GB')}</strong>
          </div>
          <div>
            <span>تاريخ العملية:</span>
            <strong>{new Date(refDate).toLocaleDateString('en-GB')}</strong>
          </div>
        </section>

        <section className="voucher-section">
          <div className="voucher-section-title">بيانات الموظف</div>
          <div className="voucher-grid">
            <div>
              <span>الاسم:</span>
              <strong>{hold.employee.fullName}</strong>
            </div>
            <div>
              <span>اسم المستخدم:</span>
              <strong>{hold.employee.username}</strong>
            </div>
          </div>
        </section>

        <section className="voucher-section">
          <div className="voucher-section-title">تفاصيل المحجوز</div>
          <table className="voucher-table">
            <tbody>
              <tr>
                <th>إجمالي المديونية</th>
                <td>{formatKd(hold.debtAmount)} د.ك</td>
              </tr>
              <tr>
                <th>المبلغ المحجوز من الراتب</th>
                <td>{formatKd(hold.holdAmount)} د.ك</td>
              </tr>
              <tr className="voucher-table-highlight">
                <th>
                  {kind === 'RELEASE' ? 'المبلغ المُحرَّر' : 'المبلغ المصروف'}
                </th>
                <td>{formatKd(amount)} د.ك</td>
              </tr>
              {hold.note ? (
                <tr>
                  <th>ملاحظات</th>
                  <td>{hold.note}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        {kind === 'DISBURSE' ? (
          <section className="voucher-section">
            <div className="voucher-section-title">بيان الصرف</div>
            <div className="voucher-paragraph">
              أقرّ أنا الموقِّع أدناه بأنني استلمت المبلغ المذكور أعلاه نقداً
              أو بحوالة بنكية باعتباره صرفاً لمحجوز مديونية سبق أن حُرِّر
              لصالحي، وبذلك تبرأ ذمة الشركة من هذا المبلغ.
            </div>
          </section>
        ) : (
          <section className="voucher-section">
            <div className="voucher-section-title">بيان التحرير</div>
            <div className="voucher-paragraph">
              بناءً على تحصيل المديونية المرتبطة بهذا المحجوز، تم تحرير
              المبلغ المذكور أعلاه ليصبح مستحقاً للموظف. الصرف يتم كإيصال
              مستقل لاحقاً عبر بند «صرف» في سجل محجوز المديونية.
            </div>
          </section>
        )}

        <section className="voucher-signatures">
          <div>
            <div className="voucher-sig-label">توقيع الموظف</div>
            <div className="voucher-sig-line" />
          </div>
          <div>
            <div className="voucher-sig-label">
              {kind === 'RELEASE' ? 'توقيع المفوَّض بالتحرير' : 'توقيع المحاسب/المالك'}
            </div>
            <div className="voucher-sig-line" />
          </div>
          <div>
            <div className="voucher-sig-label">الختم</div>
            <div className="voucher-sig-line" />
          </div>
        </section>

        <footer className="voucher-footer">
          <div className="voucher-footer-stamp">
            <DocumentQR
              docType="DEBT_HOLD"
              docId={hold.id}
              docNumber={hold.id.slice(0, 8).toUpperCase()}
              issuedAtIso={refDate}
              sizeMm={20}
            />
          </div>
          <div className="voucher-footer-meta">
            <div>{BRAND.copyrightAr}</div>
            <div>
              يُطبَع هذا الإيصال آلياً فور تنفيذ العملية — امسح الرمز
              للتحقق من الأصالة. أي تعديل يدوي يُلغي صلاحيته.
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}

export function DebtHoldsPage() {
  const { token, user, hasRole } = useAuth();
  const isAdmin = hasRole(
    'OWNER',
    'GENERAL_MANAGER',
    'ACCOUNTANT',
    'MANAGER',
  );
  // Only OWNER + GM may force-release / disburse; ACCOUNTANT/MANAGER
  // see holds in read-only mode to avoid arbitrary disbursement paths.
  const canRelease = hasRole('OWNER', 'GENERAL_MANAGER');
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [disbursingId, setDisbursingId] = useState<string | null>(null);
  /**
   * V19.17 — auto-print voucher state. We stage the hold + kind here so
   * that the <DebtHoldVoucher /> mounts into the DOM, the effect below
   * waits one tick for layout, then fires `window.print()`. After the
   * native print dialog closes (`afterprint` event) we clear the state
   * so the voucher unmounts and the debt-holds table becomes visible
   * again. This mirrors how POS receipts and staff-debts snapshots are
   * printed without navigating away.
   */
  const [voucher, setVoucher] = useState<
    { hold: DebtHoldRow; kind: VoucherKind } | null
  >(null);
  const voucherTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!voucher) return;
    // Wait a beat so the voucher DOM is fully painted before the print
    // dialog snapshots the document (Chrome/Edge occasionally prints a
    // blank page if we call `print` too early).
    voucherTimerRef.current = window.setTimeout(() => {
      window.print();
    }, 200);
    const close = () => {
      // Give the browser a moment to tear down the print preview,
      // otherwise Chrome fires `afterprint` twice on some builds and
      // the voucher flashes on-screen.
      window.setTimeout(() => setVoucher(null), 250);
    };
    window.addEventListener('afterprint', close);
    return () => {
      window.removeEventListener('afterprint', close);
      if (voucherTimerRef.current !== null) {
        window.clearTimeout(voucherTimerRef.current);
        voucherTimerRef.current = null;
      }
    };
  }, [voucher]);

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [employeeUserId, setEmployeeUserId] = useState<string>('ALL');
  /**
   * V19.17 — client-side status filter. The DB only stores HELD /
   * RELEASED, but the user-facing flow is three stages: currently
   * withheld, released-waiting-for-voucher, and fully disbursed. We
   * map these to server calls + post-filter below.
   */
  const [stage, setStage] = useState<
    'ALL' | 'HELD' | 'PENDING_DISBURSE' | 'DISBURSED'
  >('ALL');
  const [users, setUsers] = useState<TeamUserRow[] | null>(null);
  const [rows, setRows] = useState<DebtHoldRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token || !isAdmin) return;
    apiJson<TeamUserRow[]>('/api/users', { token })
      .then((u) => setUsers(Array.isArray(u) ? u : []))
      .catch(() => setUsers([]));
  }, [token, isAdmin]);

  const load = useCallback(async () => {
    if (!token) return;
    const { from, to } = monthRangeIso(month);
    setLoading(true);
    try {
      // Fetch raw rows by DB status, then post-filter for the
      // PENDING_DISBURSE vs DISBURSED split which only exists
      // client-side (both are RELEASED at the DB level).
      const serverStatus =
        stage === 'HELD'
          ? 'HELD'
          : stage === 'PENDING_DISBURSE' || stage === 'DISBURSED'
          ? 'RELEASED'
          : undefined;
      const d = await listDebtHolds(token, {
        from,
        to,
        employeeUserId:
          isAdmin && employeeUserId !== 'ALL' ? employeeUserId : undefined,
        status: serverStatus,
      });
      const filtered =
        stage === 'PENDING_DISBURSE'
          ? d.filter((r) => r.status === 'RELEASED' && !r.disbursedAt)
          : stage === 'DISBURSED'
          ? d.filter((r) => r.status === 'RELEASED' && !!r.disbursedAt)
          : d;
      setRows(filtered);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, month, employeeUserId, stage, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRelease = useCallback(
    async (id: string) => {
      if (!token || !canRelease) return;
      setReleasingId(id);
      try {
        const updated = await releaseDebtHold(token, id);
        setRows((current) =>
          (current ?? []).map((r) => (r.id === id ? updated : r)),
        );
        toast.success(
          'تم تحرير المحجوز — سيتم فتح إيصال الطباعة تلقائياً',
        );
        setVoucher({ hold: updated, kind: 'RELEASE' });
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        setReleasingId(null);
      }
    },
    [token, canRelease],
  );

  const handleDisburse = useCallback(
    async (id: string) => {
      if (!token || !canRelease) return;
      setDisbursingId(id);
      try {
        const updated = await disburseDebtHold(token, id);
        setRows((current) =>
          (current ?? []).map((r) => (r.id === id ? updated : r)),
        );
        toast.success('تم تسجيل الصرف — سيتم فتح إيصال الطباعة تلقائياً');
        setVoucher({ hold: updated, kind: 'DISBURSE' });
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        setDisbursingId(null);
      }
    },
    [token, canRelease],
  );

  const totals = useMemo(() => {
    let held = 0;
    let pending = 0;
    let disbursed = 0;
    for (const r of rows ?? []) {
      const h = Number.parseFloat(r.holdAmount);
      const x = Number.parseFloat(r.releasedAmount);
      if (r.status === 'HELD' && Number.isFinite(h)) held += h;
      else if (r.status === 'RELEASED' && Number.isFinite(x)) {
        if (r.disbursedAt) disbursed += x;
        else pending += x;
      }
    }
    return { held, pending, disbursed };
  }, [rows]);

  /**
   * V19.17 — per-employee summary. The detail table lists every single
   * hold, but the Owner usually thinks in employee buckets ("release
   * everything Saad has"). We roll the rows up here so the summary
   * card above the table shows one row per employee with totals + a
   * one-click «تحرير الكل» button that releases every HELD slip the
   * employee currently has.
   */
  const perEmployee = useMemo(() => {
    const map = new Map<
      string,
      {
        employeeUserId: string;
        name: string;
        held: number;
        pending: number;
        disbursed: number;
        heldIds: string[];
        pendingIds: string[];
      }
    >();
    for (const r of rows ?? []) {
      const e = map.get(r.employeeUserId) ?? {
        employeeUserId: r.employeeUserId,
        name: r.employee.fullName,
        held: 0,
        pending: 0,
        disbursed: 0,
        heldIds: [],
        pendingIds: [],
      };
      const h = Number.parseFloat(r.holdAmount);
      const x = Number.parseFloat(r.releasedAmount);
      if (r.status === 'HELD' && Number.isFinite(h)) {
        e.held += h;
        e.heldIds.push(r.id);
      } else if (r.status === 'RELEASED' && Number.isFinite(x)) {
        if (r.disbursedAt) e.disbursed += x;
        else {
          e.pending += x;
          e.pendingIds.push(r.id);
        }
      }
      map.set(r.employeeUserId, e);
    }
    return Array.from(map.values()).sort((a, b) => b.held - a.held);
  }, [rows]);

  const [bulkBusyFor, setBulkBusyFor] = useState<string | null>(null);

  const handleReleaseAllFor = useCallback(
    async (employeeUserId: string, heldIds: string[]) => {
      if (!token || !canRelease || heldIds.length === 0) return;
      setBulkBusyFor(employeeUserId);
      try {
        // Fire sequentially so we can show a single success voucher for
        // the last hold without losing the earlier releases. The user
        // keeps the full per-row history in the table below.
        let lastUpdated: DebtHoldRow | null = null;
        for (const id of heldIds) {
          const updated = await releaseDebtHold(token, id);
          lastUpdated = updated;
          setRows((current) =>
            (current ?? []).map((r) => (r.id === id ? updated : r)),
          );
        }
        toast.success(
          `تم تحرير ${heldIds.length} محجوز للموظف — سيتم فتح إيصال الطباعة`,
        );
        if (lastUpdated) {
          setVoucher({ hold: lastUpdated, kind: 'RELEASE' });
        }
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        setBulkBusyFor(null);
      }
    },
    [token, canRelease],
  );

  const handleDisburseAllFor = useCallback(
    async (employeeUserId: string, pendingIds: string[]) => {
      if (!token || !canRelease || pendingIds.length === 0) return;
      setBulkBusyFor(employeeUserId);
      try {
        let lastUpdated: DebtHoldRow | null = null;
        for (const id of pendingIds) {
          const updated = await disburseDebtHold(token, id);
          lastUpdated = updated;
          setRows((current) =>
            (current ?? []).map((r) => (r.id === id ? updated : r)),
          );
        }
        toast.success(
          `تم صرف ${pendingIds.length} محجوز للموظف — سيتم فتح إيصال الطباعة`,
        );
        if (lastUpdated) {
          setVoucher({ hold: lastUpdated, kind: 'DISBURSE' });
        }
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        setBulkBusyFor(null);
      }
    },
    [token, canRelease],
  );

  /**
   * V19.17 — page-level print. Dumps the current filter + summary +
   * per-employee roll-up + detail table into a dedicated print root
   * (`#debt-holds-print-root`) so auditors can snapshot the Owner's
   * view of the register at any point in time. The voucher flow
   * (released / disbursed) remains a separate receipt workflow —
   * this button produces a *report*, not a receipt.
   */
  const handlePagePrint = useCallback(() => {
    if (typeof window !== 'undefined') {
      // Let the browser commit the latest DOM (rows + summary) before
      // opening the print preview.
      window.setTimeout(() => window.print(), 50);
    }
  }, []);

  return (
    <div className="space-y-6 p-4 md:p-6" id="debt-holds-print-root">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          {isAdmin && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground print-hide">
              <Link to="/settings/dashboard" className="hover:underline">
                لوحة الإعدادات
              </Link>
              <ArrowLeft className="size-3.5 -scale-x-100" />
              <span>سجل محجوز المديونية</span>
            </div>
          )}
          <h1 className="text-2xl font-bold">
            {isAdmin
              ? 'محجوز المديونية — تحرير وصرف مستقل'
              : 'محجوزات الراتب الخاصة بي'}
          </h1>
          <p className="text-sm text-muted-foreground">
            تدفق من مرحلتين مستقل تماماً عن مسير الرواتب: أولاً «تحرير»
            المبلغ عند تحصيل المديونية، ثم «صرف» كإيصال منفصل يُسلَّم
            للموظف لاحقاً.
            {canRelease ? ' فقط المالك والمدير العام يستطيعان التنفيذ.' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 print-hide">
          <Button
            variant="outline"
            onClick={handlePagePrint}
            disabled={loading || !rows || rows.length === 0}
            title="طباعة سجل المحجوز الحالي (حسب عوامل التصفية)"
          >
            <Printer className="size-4" />
            <span className="ms-1">طباعة السجل</span>
          </Button>
        </div>
      </header>

      {/*
       * V19.17 — print-only banner. Surfaced exclusively on the print
       * snapshot with the organisation name, the period/employee
       * filter the Owner applied, and a digital QR so auditors can
       * cross-check the snapshot timestamp. Hidden on screen to keep
       * the live UI clean.
       */}
      <div className="debt-holds-print-banner" aria-hidden="true">
        <div>
          <div className="debt-holds-print-org">{BRAND.customerAr}</div>
          <div className="debt-holds-print-sub">
            {BRAND.systemAr} — سجل محجوز المديونية
          </div>
        </div>
        <div className="debt-holds-print-meta">
          <div>
            <span>الشهر:</span>
            <strong>{month}</strong>
          </div>
          <div>
            <span>المرحلة:</span>
            <strong>
              {stage === 'ALL'
                ? 'كل المراحل'
                : stage === 'HELD'
                ? 'محجوز نشط'
                : stage === 'PENDING_DISBURSE'
                ? 'جاهز للصرف'
                : 'مصروف'}
            </strong>
          </div>
          <div>
            <span>الموظف:</span>
            <strong>
              {employeeUserId === 'ALL'
                ? 'كل الموظفين'
                : users?.find((u) => u.id === employeeUserId)?.fullName ??
                  employeeUserId.slice(0, 8)}
            </strong>
          </div>
          <div>
            <span>تاريخ السحب:</span>
            <strong>{new Date().toLocaleString('en-GB')}</strong>
          </div>
        </div>
      </div>

      <Card className="print-hide">
        <CardHeader>
          <CardTitle>عوامل التصفية</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>الشهر</Label>
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
            {isAdmin && (
              <div className="space-y-1.5">
                <Label>الموظف</Label>
                <Select
                  value={employeeUserId}
                  onValueChange={(v) => setEmployeeUserId(v ?? 'ALL')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">كل الموظفين</SelectItem>
                    {(users ?? []).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>المرحلة</Label>
              <Select
                value={stage}
                onValueChange={(v) =>
                  setStage(
                    v as
                      | 'ALL'
                      | 'HELD'
                      | 'PENDING_DISBURSE'
                      | 'DISBURSED',
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">كل المراحل</SelectItem>
                  <SelectItem value="HELD">محجوز (نشط)</SelectItem>
                  <SelectItem value="PENDING_DISBURSE">
                    جاهز للصرف
                  </SelectItem>
                  <SelectItem value="DISBURSED">مصروف</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => void load()}
                disabled={loading}
                className="w-full"
              >
                {loading && <Loader2 className="me-2 size-4 animate-spin" />}
                تحديث
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="py-3">
            <div className="text-xs text-muted-foreground">
              محجوز نشط
            </div>
            <div className="text-xl font-bold text-amber-600">
              {totals.held.toLocaleString('en-GB', {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              })}{' '}
              د.ك
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <div className="text-xs text-muted-foreground">
              جاهز للصرف (مُحرَّر)
            </div>
            <div className="text-xl font-bold text-sky-600">
              {totals.pending.toLocaleString('en-GB', {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              })}{' '}
              د.ك
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <div className="text-xs text-muted-foreground">
              مصروف للموظف
            </div>
            <div className="text-xl font-bold text-emerald-600">
              {totals.disbursed.toLocaleString('en-GB', {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              })}{' '}
              د.ك
            </div>
          </CardContent>
        </Card>
      </div>

      {isAdmin && perEmployee.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>ملخّص حسب الموظف</CardTitle>
            <p className="text-xs text-muted-foreground">
              صف واحد لكل موظف مع مجموع محجوزاته وأزرار دفعة واحدة — مناسب لمن
              يعمل «أفرج عن كل محجوزات فلان» دون الحاجة للضغط على كل صف في
              الجدول بالأسفل.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الموظف</TableHead>
                  {canRelease && (
                    <TableHead
                      className="text-center"
                      data-action-col="true"
                    >
                      إجراء جماعي
                    </TableHead>
                  )}
                  <TableHead className="text-center">محجوز نشط (د.ك)</TableHead>
                  <TableHead className="text-center">جاهز للصرف (د.ك)</TableHead>
                  <TableHead className="text-center">مصروف (د.ك)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perEmployee.map((e) => {
                  const busy = bulkBusyFor === e.employeeUserId;
                  const hasHeld = e.heldIds.length > 0;
                  const hasPending = e.pendingIds.length > 0;
                  return (
                    <TableRow key={e.employeeUserId}>
                      <TableCell className="font-medium">
                        {user?.id === e.employeeUserId
                          ? `${e.name} (أنت)`
                          : e.name}
                      </TableCell>
                      {canRelease && (
                        <TableCell data-action-col="true">
                          <div className="flex items-center justify-center gap-1.5">
                            {hasHeld ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  void handleReleaseAllFor(
                                    e.employeeUserId,
                                    e.heldIds,
                                  )
                                }
                                title={`تحرير ${e.heldIds.length} محجوز لهذا الموظف`}
                              >
                                {busy ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Undo2 className="size-4" />
                                )}
                                <span className="ms-1">
                                  تحرير الكل ({e.heldIds.length})
                                </span>
                              </Button>
                            ) : null}
                            {hasPending ? (
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  void handleDisburseAllFor(
                                    e.employeeUserId,
                                    e.pendingIds,
                                  )
                                }
                                className="bg-sky-600 hover:bg-sky-700"
                                title={`صرف ${e.pendingIds.length} محجوز محرَّر لهذا الموظف`}
                              >
                                {busy ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Banknote className="size-4" />
                                )}
                                <span className="ms-1">
                                  صرف الكل ({e.pendingIds.length})
                                </span>
                              </Button>
                            ) : null}
                            {!hasHeld && !hasPending ? (
                              <span className="text-xs text-muted-foreground">
                                لا يوجد إجراء معلق
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="text-center font-mono font-semibold text-amber-600">
                        {e.held.toLocaleString('en-GB', {
                          minimumFractionDigits: 3,
                          maximumFractionDigits: 3,
                        })}
                      </TableCell>
                      <TableCell className="text-center font-mono font-semibold text-sky-600">
                        {e.pending.toLocaleString('en-GB', {
                          minimumFractionDigits: 3,
                          maximumFractionDigits: 3,
                        })}
                      </TableCell>
                      <TableCell className="text-center font-mono font-semibold text-emerald-600">
                        {e.disbursed.toLocaleString('en-GB', {
                          minimumFractionDigits: 3,
                          maximumFractionDigits: 3,
                        })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>التفاصيل</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !rows || rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              لا توجد مبالغ محجوزة في هذا النطاق.
            </div>
          ) : (
            <Table className="debt-holds-details-table">
              <TableHeader>
                <TableRow>
                  {/*
                   * V19.17 — column order tuned for one-glance action:
                   *   employee → action → stage → amounts → dates → note
                   * Previously the action column was the very last cell in
                   * the row, which pushed it past the visible area on
                   * 1280-wide monitors (user feedback: "وين زر تحرير
                   * الحجز حسب المؤظف"). Keeping the action right after
                   * the employee name guarantees the release / disburse
                   * button is always in the same horizontal band as the
                   * name, no matter how many optional columns render.
                   */}
                  {isAdmin && <TableHead>الموظف</TableHead>}
                  {canRelease && (
                    <TableHead
                      className="text-center"
                      data-action-col="true"
                    >
                      إجراء
                    </TableHead>
                  )}
                  <TableHead>المرحلة</TableHead>
                  <TableHead className="text-center">
                    المديونية (د.ك)
                  </TableHead>
                  <TableHead className="text-center">
                    المبلغ المحجوز (د.ك)
                  </TableHead>
                  <TableHead>تاريخ الاستحقاق</TableHead>
                  <TableHead>تاريخ التحرير</TableHead>
                  <TableHead>تاريخ الصرف</TableHead>
                  <TableHead>ملاحظة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const isHeld = r.status === 'HELD';
                  const isPending =
                    r.status === 'RELEASED' && !r.disbursedAt;
                  return (
                    <TableRow key={r.id}>
                      {isAdmin && (
                        <TableCell className="font-medium">
                          {user?.id === r.employeeUserId
                            ? `${r.employee.fullName} (أنت)`
                            : r.employee.fullName}
                        </TableCell>
                      )}
                      {canRelease && (
                        <TableCell data-action-col="true">
                          {isHeld ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleRelease(r.id)}
                              disabled={releasingId === r.id}
                            >
                              {releasingId === r.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Undo2 className="size-4" />
                              )}
                              <span className="ms-1">تحرير</span>
                            </Button>
                          ) : isPending ? (
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                onClick={() => void handleDisburse(r.id)}
                                disabled={disbursingId === r.id}
                                className="bg-sky-600 hover:bg-sky-700"
                              >
                                {disbursingId === r.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Banknote className="size-4" />
                                )}
                                <span className="ms-1">صرف</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setVoucher({ hold: r, kind: 'RELEASE' })
                                }
                                title="إعادة طباعة إيصال التحرير"
                              >
                                <Printer className="size-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">
                                {r.disbursedBy?.fullName
                                  ? `صرفه ${r.disbursedBy.fullName}`
                                  : '—'}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setVoucher({ hold: r, kind: 'DISBURSE' })
                                }
                                title="إعادة طباعة إيصال الصرف"
                              >
                                <Printer className="size-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        {isHeld ? (
                          <Badge variant="secondary">محجوز</Badge>
                        ) : isPending ? (
                          <Badge className="bg-sky-600 hover:bg-sky-700">
                            جاهز للصرف
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-600 hover:bg-emerald-700">
                            مصروف
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {formatKd(r.debtAmount)}
                      </TableCell>
                      <TableCell className="text-center font-mono font-semibold text-amber-600">
                        {formatKd(r.holdAmount)}
                      </TableCell>
                      <TableCell>
                        {r.payroll
                          ? new Date(
                              r.payroll.paymentDate,
                            ).toLocaleDateString('ar-KW')
                          : new Date(r.createdAt).toLocaleDateString('ar-KW')}
                      </TableCell>
                      <TableCell>
                        {r.releaseDate
                          ? new Date(r.releaseDate).toLocaleDateString('ar-KW')
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {r.disbursedAt
                          ? new Date(r.disbursedAt).toLocaleDateString('ar-KW')
                          : '—'}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">
                        {r.note ?? '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {voucher && <DebtHoldVoucher hold={voucher.hold} kind={voucher.kind} />}
    </div>
  );
}

export default DebtHoldsPage;
