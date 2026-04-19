import { useAuth } from '@/contexts/auth-context';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { type BranchRow, apiJson, ApiError } from '@/lib/api';
import { FinancialCycleCard } from '@/modules/owner/components/FinancialCycleCard';
import { StaffControlReactor } from '@/modules/shared/reactors/StaffControlReactor';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';

/**
 * DUSTUR §2 — Owner dashboard = System Control Panel.
 *
 * Every OWNER-owned control surface lands here (financial cycle, staff control,
 * branches, and — as the remaining Dastur tasks ship — debt transfer, serial
 * gap alerts, attendance, and the unified GL snapshot).
 */
export function OwnerDashboard() {
  const { token } = useAuth();
  const [branches, setBranches] = useState<BranchRow[]>([]);

  useEffect(() => {
    if (!token) return;
    void apiJson<BranchRow[]>('/api/branches', { token })
      .then((rows) => setBranches(Array.isArray(rows) ? rows : []))
      .catch((e) => {
        if (e instanceof ApiError) toast.error(e.message);
      });
  }, [token]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold text-slate-950">
          لوحة تحكم النظام
        </h1>
        <p className="text-sm text-slate-600">
          المصدر الوحيد لمراقبة الدورة المالية، الموظفين، والفروع — تحت إشراف
          المالك حصراً.
        </p>
      </header>

      <FinancialCycleCard token={token} />

      <StaffControlReactor token={token} />

      <Card className="border-slate-300 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-slate-950">الفروع</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-100/90 hover:bg-slate-100/90">
                  <TableHead className="font-bold text-slate-950">الفرع</TableHead>
                  <TableHead className="font-bold text-slate-950">الموقع</TableHead>
                  <TableHead className="font-bold text-slate-950">الهاتف</TableHead>
                  <TableHead className="font-bold text-slate-950">الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-semibold text-slate-900">{b.name}</TableCell>
                    <TableCell className="text-slate-800">{b.location}</TableCell>
                    <TableCell className="text-slate-800">{b.phone?.trim() || '—'}</TableCell>
                    <TableCell className="text-slate-800">{b.isActive ? 'نشط' : 'غير نشط'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
