import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  type CommissionMode,
  type CommissionPayoutStatus,
  type CommissionPayoutTiming,
  type CommissionPayoutsResponse,
  type TeamUserRow,
  apiJson,
  listCommissionPayouts,
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

const MODE_LABEL: Record<CommissionMode, string> = {
  SALE: 'بيع',
  COLLECTION: 'تحصيل',
};

const STATUS_LABEL: Record<CommissionPayoutStatus, string> = {
  PENDING: 'معلّق',
  RELEASED: 'جاهز للصرف',
  PAID: 'مدفوع',
  CANCELLED: 'ملغي',
};

const TIMING_SHORT: Record<CommissionPayoutTiming, string> = {
  IMMEDIATE: 'فوري',
  AFTER_COLLECTION: 'بعد التحصيل',
  END_OF_MONTH: 'نهاية الشهر',
};

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

export function CommissionPayoutsPage() {
  const { token, user, hasRole } = useAuth();
  const isAdmin = hasRole(
    'OWNER',
    'GENERAL_MANAGER',
    'ACCOUNTANT',
    'MANAGER',
  );

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [earnerUserId, setEarnerUserId] = useState<string>('ALL');
  const [status, setStatus] = useState<CommissionPayoutStatus | 'ALL'>(
    'ALL',
  );
  const [users, setUsers] = useState<TeamUserRow[] | null>(null);
  const [data, setData] = useState<CommissionPayoutsResponse | null>(null);
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
      const d = await listCommissionPayouts(token, {
        from,
        to,
        earnerUserId:
          isAdmin && earnerUserId !== 'ALL' ? earnerUserId : undefined,
        status: status === 'ALL' ? undefined : status,
      });
      setData(d);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, month, earnerUserId, status, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const userLookup = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users ?? []) m.set(u.id, u.fullName);
    return m;
  }, [users]);

  const personalView = !isAdmin;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header>
        {isAdmin && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/settings/dashboard" className="hover:underline">
              لوحة الإعدادات
            </Link>
            <ArrowLeft className="size-3.5 -scale-x-100" />
            <span>كشف العمولة</span>
          </div>
        )}
        <h1 className="text-2xl font-bold">
          {personalView ? 'كشف العمولة الشخصي' : 'كشف العمولة العام'}
        </h1>
        <p className="text-sm text-muted-foreground">
          سجل مستقل لمستحقات العمولة — منفصل عن البدلات في مسير الرواتب،
          حسب دستور V19.16.
        </p>
      </header>

      <Card>
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
                  value={earnerUserId}
                  onValueChange={(v) => setEarnerUserId(v ?? 'ALL')}
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
              <Label>الحالة</Label>
              <Select
                value={status}
                onValueChange={(v) =>
                  setStatus(v as CommissionPayoutStatus | 'ALL')
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">كل الحالات</SelectItem>
                  {(
                    Object.keys(STATUS_LABEL) as CommissionPayoutStatus[]
                  ).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
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

      {data && data.totals.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <TotalsCard
            label="جاهز للصرف"
            kd={sumField(data, 'releasedKd')}
            tone="success"
          />
          <TotalsCard
            label="مدفوع"
            kd={sumField(data, 'paidKd')}
            tone="muted"
          />
          <TotalsCard
            label="معلّق"
            kd={sumField(data, 'pendingKd')}
            tone="warning"
          />
          <TotalsCard
            label="ملغي"
            kd={sumField(data, 'cancelledKd')}
            tone="destructive"
          />
        </div>
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
          ) : !data || data.rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              لا توجد مستحقات في هذا النطاق.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  {isAdmin && <TableHead>الموظف</TableHead>}
                  <TableHead>القاعدة</TableHead>
                  <TableHead>النمط</TableHead>
                  <TableHead className="text-center">الأساس (د.ك)</TableHead>
                  <TableHead className="text-center">النسبة</TableHead>
                  <TableHead className="text-center">المبلغ (د.ك)</TableHead>
                  <TableHead>التوقيت</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الفاتورة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {new Date(r.earnedAt).toLocaleDateString('ar-KW')}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        {user?.id === r.earnerUserId
                          ? `${r.earner.fullName} (أنت)`
                          : (userLookup.get(r.earnerUserId) ??
                            r.earner.fullName)}
                      </TableCell>
                    )}
                    <TableCell>{r.rule.name}</TableCell>
                    <TableCell>{MODE_LABEL[r.mode]}</TableCell>
                    <TableCell className="text-center font-mono">
                      {formatKd(r.basisAmount)}
                    </TableCell>
                    <TableCell className="text-center font-mono">
                      {Number.parseFloat(r.percentage).toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-center font-mono font-semibold">
                      {formatKd(r.amount)}
                    </TableCell>
                    <TableCell>
                      {TIMING_SHORT[r.rule.payoutTiming]}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell>
                      {r.sourceOrder?.invoiceNumber ??
                        r.sourceOrder?.serialNumber ??
                        '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function sumField(
  data: CommissionPayoutsResponse,
  key: 'pendingKd' | 'releasedKd' | 'paidKd' | 'cancelledKd',
): string {
  let sum = 0;
  for (const t of data.totals) {
    const n = Number.parseFloat(t[key]);
    if (Number.isFinite(n)) sum += n;
  }
  return sum.toLocaleString('en-GB', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function TotalsCard({
  label,
  kd,
  tone,
}: {
  label: string;
  kd: string;
  tone: 'success' | 'muted' | 'warning' | 'destructive';
}) {
  const toneClass = {
    success: 'text-emerald-600',
    muted: 'text-foreground',
    warning: 'text-amber-600',
    destructive: 'text-destructive',
  }[tone];
  return (
    <Card>
      <CardContent className="py-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-xl font-bold ${toneClass}`}>{kd} د.ك</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: CommissionPayoutStatus }) {
  switch (status) {
    case 'RELEASED':
      return <Badge>جاهز للصرف</Badge>;
    case 'PAID':
      return <Badge variant="secondary">مدفوع</Badge>;
    case 'PENDING':
      return <Badge variant="outline">معلّق</Badge>;
    case 'CANCELLED':
      return <Badge variant="destructive">ملغي</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default CommissionPayoutsPage;
