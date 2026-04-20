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
        <h1 className="text-2xl font-extrabold text-foreground">
          إدارة الموظفين والفروع
        </h1>
        <p className="text-sm text-muted-foreground">
          دليل الموظفين، تغيير الأدوار، تفعيل/إيقاف الحسابات، وسجل الفروع. الدورة
          المالية ولوحة التحكم الرئيسية في صفحة المالية.
        </p>
      </header>

      <StaffControlReactor token={token} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold text-foreground">الفروع</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/70 hover:bg-muted/70">
                  <TableHead className="font-bold text-foreground">الفرع</TableHead>
                  <TableHead className="font-bold text-foreground">الموقع</TableHead>
                  <TableHead className="font-bold text-foreground">الهاتف</TableHead>
                  <TableHead className="font-bold text-foreground">الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-semibold text-foreground">{b.name}</TableCell>
                    <TableCell className="text-foreground/90">{b.location}</TableCell>
                    <TableCell className="text-foreground/90">{b.phone?.trim() || '—'}</TableCell>
                    <TableCell className="text-foreground/90">{b.isActive ? 'نشط' : 'غير نشط'}</TableCell>
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
