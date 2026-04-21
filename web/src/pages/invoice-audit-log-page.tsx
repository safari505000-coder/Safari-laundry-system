import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import {
  FileSignature,
  Loader2,
  Pencil,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  ApiError,
  listInvoiceAuditLog,
  type InvoiceAuditAction,
  type InvoiceAuditLogResponse,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function subDays(d: Date, days: number): Date {
  const n = new Date(d);
  n.setDate(n.getDate() - days);
  return n;
}

/**
 * V19.9 — Read-only audit trail of every Call-Center-Supervisor edit
 * or void. OWNER / GM / ACCOUNTANT can open this page; supervisors
 * themselves never see it, so the trail is tamper-evident for the
 * audit role.
 */
export function InvoiceAuditLogPage() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const allowed = can(user, 'invoiceAudit.view');

  const [fromIso, setFromIso] = useState(isoDay(subDays(new Date(), 30)));
  const [toIso, setToIso] = useState(isoDay(new Date()));
  const [action, setAction] = useState<InvoiceAuditAction | ''>('');
  const [data, setData] = useState<InvoiceAuditLogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token || !allowed) return;
      if (!opts?.silent) setLoading(true);
      try {
        const res = await listInvoiceAuditLog(token, {
          from: fromIso,
          to: toIso,
          action: action || undefined,
          limit: 200,
        });
        setData(res);
      } catch (e) {
        const msg =
          e instanceof ApiError
            ? e.message
            : 'تعذر تحميل سجل تعديل/إلغاء الفواتير';
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [token, allowed, fromIso, toIso, action],
  );

  useEffect(() => {
    void load({ silent: true });
  }, [load]);

  const totals = useMemo(() => {
    if (!data) return { edits: 0, voids: 0, impact: 0 };
    let edits = 0;
    let voids = 0;
    let impact = 0;
    for (const r of data.rows) {
      if (r.action === 'EDIT') edits += 1;
      else voids += 1;
      impact += Number(r.financialImpactKd);
    }
    return { edits, voids, impact };
  }, [data]);

  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FileSignature className="h-6 w-6 text-amber-500" />
            {t('nav.invoiceAudit')}
          </h1>
          <p className="text-sm text-muted-foreground">
            سجل غير قابل للتغيير لكل تعديل أو إلغاء فاتورة يُجريه مسؤول
            الكول سنتر
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="from">من</Label>
            <Input
              id="from"
              type="date"
              value={fromIso}
              onChange={(e) => setFromIso(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="to">إلى</Label>
            <Input
              id="to"
              type="date"
              value={toIso}
              onChange={(e) => setToIso(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="action">النوع</Label>
            <select
              id="action"
              value={action}
              onChange={(e) =>
                setAction((e.target.value as InvoiceAuditAction) || '')
              }
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">الكل</option>
              <option value="EDIT">تعديل فقط</option>
              <option value="VOID">إلغاء فقط</option>
            </select>
          </div>
          <Button onClick={() => load()} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            تحديث
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-blue-50 p-4 dark:bg-blue-900/20">
          <div className="text-xs text-blue-700 dark:text-blue-300">
            تعديلات
          </div>
          <div className="text-2xl font-bold text-blue-800 dark:text-blue-200">
            {totals.edits}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-red-50 p-4 dark:bg-red-900/20">
          <div className="text-xs text-red-700 dark:text-red-300">
            إلغاءات
          </div>
          <div className="text-2xl font-bold text-red-800 dark:text-red-200">
            {totals.voids}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-amber-50 p-4 dark:bg-amber-900/20">
          <div className="text-xs text-amber-700 dark:text-amber-300">
            صافي الأثر المالي
          </div>
          <div className="text-2xl font-bold text-amber-800 dark:text-amber-200">
            {formatKwdLabel(totals.impact.toFixed(3))}
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>التاريخ</TableHead>
              <TableHead>النوع</TableHead>
              <TableHead>الفاتورة</TableHead>
              <TableHead>العميل</TableHead>
              <TableHead>الموظف</TableHead>
              <TableHead className="text-right">الأثر</TableHead>
              <TableHead>السبب / الحقول</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data || data.rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-muted-foreground"
                >
                  لا توجد حركات تدقيق في هذه الفترة
                </TableCell>
              </TableRow>
            ) : (
              data.rows.map((r) => (
                <>
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(r.createdAt).toLocaleString('ar-KW')}
                    </TableCell>
                    <TableCell>
                      {r.action === 'EDIT' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                          <Pencil className="h-3 w-3" /> تعديل
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300">
                          <XCircle className="h-3 w-3" /> إلغاء
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.order?.serialNumber ||
                        r.order?.invoiceNumber ||
                        r.orderId.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      {r.order?.customer?.displayName || '—'}
                    </TableCell>
                    <TableCell>{r.actorNameAtTime}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatKwdLabel(r.financialImpactKd)}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                      {r.reason || r.changedFields.join(', ')}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setExpanded(expanded === r.id ? null : r.id)
                        }
                      >
                        {expanded === r.id ? '−' : '+'}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expanded === r.id ? (
                    <TableRow>
                      <TableCell colSpan={8} className="bg-muted/30">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <div className="mb-1 font-semibold">قبل</div>
                            <pre className="overflow-x-auto rounded bg-background p-2 font-mono">
                              {JSON.stringify(
                                r.beforeSnapshot,
                                null,
                                2,
                              )}
                            </pre>
                          </div>
                          <div>
                            <div className="mb-1 font-semibold">بعد</div>
                            <pre className="overflow-x-auto rounded bg-background p-2 font-mono">
                              {JSON.stringify(r.afterSnapshot, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
