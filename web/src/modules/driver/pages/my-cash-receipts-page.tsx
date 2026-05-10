import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Printer, ReceiptText, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  type ManagerCashCustodyRow,
  listMyDriverCashReceipts,
} from '@/lib/api';
import { formatKwdAmount, formatKwdLabel, sumKwdStrings } from '@/lib/kwd';
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
import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';

/**
 * V19.17 — Driver's "My Cash-Handover Receipts" page (سندات الاستلام).
 *
 * Every time a branch manager approves receipt of the driver's CASH
 * custody (the office-side flow in `/manager-custody/approve-receipt`),
 * a formal `ManagerCashCustody` row is created. This page lists every
 * such row attributed to the signed-in driver and lets them open each
 * one as a printable A4 voucher (`/my-cash-receipts/:id/print`).
 *
 * The voucher is the driver's proof that the cash physically left
 * their hands and was accepted by the branch manager — a standalone
 * audit artefact independent of the payroll cycle or shift cycle.
 */

const STATUS_TONE: Record<
  ManagerCashCustodyRow['status'],
  { label: string; variant: 'secondary' | 'outline' | 'destructive' | 'default' }
> = {
  PENDING_DEPOSIT: { label: 'بانتظار الإيداع', variant: 'secondary' },
  AWAITING_VERIFICATION: { label: 'بانتظار التدقيق', variant: 'outline' },
  VERIFIED: { label: 'مُدقَّق', variant: 'default' },
  REJECTED: { label: 'مرفوض', variant: 'destructive' },
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function MyCashReceiptsPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<ManagerCashCustodyRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await listMyDriverCashReceipts(token);
      setRows(data);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error('تعذّر تحميل السندات');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * V21 Phase 5 — totals routed through the single canonical
   * `sumKwdStrings` helper from `@/lib/kwd`. The previous local
   * `for…of` + `Number.parseFloat` block was retired so this page no
   * longer owns any KD math primitive. The helper returns a 4dp-input
   * 3dp-output decimal string, which the canonical `formatKwdLabel`
   * then renders.
   */
  const totals = useMemo(() => {
    if (!rows) return { count: 0, amountKd: '0.000' };
    return {
      count: rows.length,
      amountKd: sumKwdStrings(rows.map((r) => r.amountKd)),
    };
  }, [rows]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5" />
            سندات استلام العهدة النقدية
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="ms-1 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="ms-1 h-4 w-4" />
            )}
            تحديث
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            كل سطر هنا يمثّل مبلغاً سلّمته نقداً إلى مدير الفرع وتمّت الموافقة
            عليه رسمياً في النظام. افتح أي سند وسحبه نسخة رسمية للطباعة
            (A4) مع ختم تحقّق رقمي.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">عدد السندات</div>
              <div className="text-xl font-semibold">{totals.count}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                إجمالي المبالغ المُسلَّمة
              </div>
              <div className="text-xl font-semibold">
                {formatKwdLabel(totals.amountKd)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">السندات</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !rows ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : rows && rows.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>تاريخ الاستلام</TableHead>
                    <TableHead>مدير الفرع</TableHead>
                    <TableHead>الفرع</TableHead>
                    <TableHead className="text-end">المبلغ (د.ك)</TableHead>
                    <TableHead className="text-center">
                      عدد الفواتير
                    </TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                    <TableHead className="text-center">السند</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const tone = STATUS_TONE[row.status];
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(row.receivedFromDriverAt)}
                        </TableCell>
                        <TableCell>{row.managerName}</TableCell>
                        <TableCell>{row.branchName ?? '—'}</TableCell>
                        <TableCell className="text-end font-mono">
                          {formatKwdAmount(row.amountKd)}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.settledOrderCount}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={tone.variant}>{tone.label}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Link
                            to={`/my-cash-receipts/${row.id}/print`}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(
                              buttonVariants({ variant: 'outline', size: 'sm' }),
                            )}
                          >
                            <Printer className="ms-1 h-4 w-4" />
                            طباعة
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              لا توجد سندات استلام مسجّلة بعد. عندما يعتمد مدير الفرع تسليمك
              للعهدة النقدية سيظهر السند تلقائياً هنا.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default MyCashReceiptsPage;
