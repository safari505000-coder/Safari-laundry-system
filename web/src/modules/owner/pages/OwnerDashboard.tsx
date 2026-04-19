import { useAuth } from '@/contexts/auth-context';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { type BranchRow, apiJson, ApiError } from '@/lib/api';
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
 * Owner island — Staff & Branches management.
 *
 * The financial cycle / control panel widgets live on the main `/financials`
 * page (the Owner's default landing). This page is strictly for HR-style
 * operations: staff directory, role changes, enable/disable users, and the
 * branches registry.
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
          إدارة الموظفين والفروع
        </h1>
        <p className="text-sm text-slate-600">
          دليل الموظفين، تغيير الأدوار، تفعيل/إيقاف الحسابات، وسجل الفروع. الدورة
          المالية ولوحة التحكم الرئيسية في صفحة المالية.
        </p>
      </header>

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
