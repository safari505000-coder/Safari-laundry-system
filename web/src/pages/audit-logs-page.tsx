import { useEffect, useState } from 'react';
import { FileSearch, RefreshCw } from 'lucide-react';
import { Button } from '@/modules/shared/components/ui/button';
import { Card, CardContent } from '@/modules/shared/components/ui/card';
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
import { ApiError, listAuditLogs, type AuditLogsResponse } from '@/lib/api';

export function AuditLogsPage() {
  const { token } = useAuth();
  const [customerId, setCustomerId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [data, setData] = useState<AuditLogsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const next = await listAuditLogs(token, {
        customerId: customerId.trim() || undefined,
        driverId: driverId.trim() || undefined,
        orderId: orderId.trim() || undefined,
      });
      setData(next);
      setError(null);
    } catch (e) {
      setData({ rows: [] });
      setError(e instanceof ApiError ? e.message : 'تعذر تحميل سجل التدقيق');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="space-y-6 p-6 text-right" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FileSearch className="h-6 w-6 text-blue-600" />
            سجل التدقيق
          </h1>
          <p className="text-sm text-muted-foreground">
            عرض زمني لأحداث التدقيق من API فقط. الواجهة لا تحسب ولا تعدّل.
          </p>
        </div>
        <Button onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          تحديث
        </Button>
      </header>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <div>
            <Label htmlFor="customerId">معرف العميل</Label>
            <Input
              id="customerId"
              dir="ltr"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              placeholder="UUID"
            />
          </div>
          <div>
            <Label htmlFor="driverId">معرف السائق</Label>
            <Input
              id="driverId"
              dir="ltr"
              value={driverId}
              onChange={(event) => setDriverId(event.target.value)}
              placeholder="UUID"
            />
          </div>
          <div>
            <Label htmlFor="orderId">معرف الفاتورة</Label>
            <Input
              id="orderId"
              dir="ltr"
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
              placeholder="UUID"
            />
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-sm text-amber-900">
            تعذر تحميل سجل التدقيق حالياً. تم عرض حالة فارغة بدل تعطل الصفحة.
            التفاصيل: {error}
          </CardContent>
        </Card>
      ) : null}

      <section className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الوقت</TableHead>
              <TableHead>الإجراء</TableHead>
              <TableHead>المبلغ</TableHead>
              <TableHead>المصدر</TableHead>
              <TableHead>المستخدم</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.rows ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  لا توجد سجلات تدقيق ضمن الفلاتر الحالية
                </TableCell>
              </TableRow>
            ) : (
              data!.rows.map((row, index) => (
                <TableRow key={`${row.timestamp}-${row.action}-${index}`}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(row.timestamp).toLocaleString('ar-KW')}
                  </TableCell>
                  <TableCell>{row.action}</TableCell>
                  <TableCell dir="ltr">{row.amount ?? '-'}</TableCell>
                  <TableCell>{row.source ?? '-'}</TableCell>
                  <TableCell dir="ltr">{row.userId ?? '-'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
