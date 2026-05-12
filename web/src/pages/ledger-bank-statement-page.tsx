/**
 * V25 — Safe read-only bank statement (customer AR / journal 1300).
 * Data: GET /api/finance/ledger/bank-statement/:customerId
 */
import { useCallback, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import { getLedgerBankStatement, type LedgerBankStatementResponse } from '@/lib/api';
import { formatKwdLabel, formatSignedKwdLabel } from '@/lib/kwd';
import { Button } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import { PageHeader } from '@/modules/shared/components/page';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';

export function LedgerBankStatementPage() {
  const { token, user } = useAuth();
  const [customerId, setCustomerId] = useState('');
  const [data, setData] = useState<LedgerBankStatementResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = Boolean(token) && can(user, 'financeLedgerReports.view');

  const load = useCallback(async () => {
    const id = customerId.trim();
    if (!id || !token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getLedgerBankStatement(token, id);
      setData(res);
    } catch {
      setData(null);
      setError('تعذر تحميل الكشف. تحقق من معرّف العميل والصلاحيات.');
    } finally {
      setLoading(false);
    }
  }, [customerId, token]);

  if (!allowed) {
    return <Navigate to="/dashboard" replace />;
  }

  const rows = data?.rows ?? [];

  return (
    <section className="space-y-6">
      <PageHeader
        title="كشف ذمم (عرض بنكي)"
        subtitle="قراءة فقط — أسطر ذمم العملاء (1300) من اليومية مع رصيد تراكمي. الحركة = مدين − دائن."
      />

      <div className="flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-2 text-sm font-medium">
          معرّف العميل (UUID)
          <Input
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setData(null);
            }}
            placeholder="00000000-0000-0000-0000-000000000000"
            dir="ltr"
            className="font-mono text-sm"
          />
        </label>
        <Button
          type="button"
          onClick={() => void load()}
          disabled={loading || !customerId.trim()}
        >
          {loading ? (
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="me-2 h-4 w-4" />
          )}
          تحميل
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {data && !error ? (
        <div className="rounded-lg border bg-card p-4 text-sm">
          <p className="font-medium">
            الرصيد الختامي:{' '}
            <span className="tabular-nums">
              {formatKwdLabel(data.closingBalanceKd)}
            </span>
          </p>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">التاريخ</TableHead>
              <TableHead>البيان</TableHead>
              <TableHead className="whitespace-nowrap text-end">
                الحركة
              </TableHead>
              <TableHead className="whitespace-nowrap text-end">
                الرصيد
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  {data
                    ? 'لا توجد حركات ذمم مسجّلة لهذا العميل في نطاق الكشف.'
                    : 'أدخل معرّف عميل ثم اضغط تحميل.'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.lineId}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {new Date(row.dateIso).toLocaleString('ar-KW', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </TableCell>
                  <TableCell className="max-w-md">{row.description}</TableCell>
                  <TableCell className="text-end tabular-nums">
                    {formatSignedKwdLabel(row.movementKd)}
                  </TableCell>
                  <TableCell className="text-end font-medium tabular-nums">
                    {formatKwdLabel(row.runningBalanceKd)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export default LedgerBankStatementPage;
