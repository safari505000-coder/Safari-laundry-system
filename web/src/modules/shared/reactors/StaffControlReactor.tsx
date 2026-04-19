import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Loader2, Power, RotateCcwKey, Save, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { BranchRow, SafariRole, TeamUserRow } from '@/lib/api';
import { apiJson, ApiError } from '@/lib/api';
import { Button } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';

const ROLE_OPTIONS: SafariRole[] = [
  'OWNER',
  'GENERAL_MANAGER',
  'MANAGER',
  'DRIVER',
  'CALL_CENTER',
  'ACCOUNTANT',
  'SUPERVISOR',
  'VIEWER',
];

const USERNAME_PATTERN = /^[\w.-]+$/;

type Props = {
  token: string | null;
};

export function StaffControlReactor({ token }: Props) {
  const [users, setUsers] = useState<TeamUserRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [branchDraftByUser, setBranchDraftByUser] = useState<Record<string, string>>({});

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [safariRole, setSafariRole] = useState<SafariRole>('DRIVER');
  const [branchId, setBranchId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const canSubmit = useMemo(
    () => fullName.trim().length >= 2 && username.trim().length >= 2 && password.length >= 1 && branchId.length > 0,
    [branchId, fullName, password.length, username],
  );

  const loadUsers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiJson<TeamUserRow[]>('/api/users', { token });
      const safe = Array.isArray(data) ? data : [];
      setUsers(safe);
      const drafts: Record<string, string> = {};
      for (const u of safe) {
        drafts[u.id] = u.branchId ?? '';
      }
      setBranchDraftByUser(drafts);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (!token) return;
    void apiJson<BranchRow[]>('/api/branches', { token })
      .then((rows) => setBranches(Array.isArray(rows) ? rows : []))
      .catch(() => setBranches([]));
  }, [token]);

  function onCreate(e: FormEvent) {
    e.preventDefault();
    void (async () => {
      if (!token) return;
      const fn = fullName.trim();
      const un = username.trim();
      if (!canSubmit) {
        toast.error('يرجى تعبئة الحقول المطلوبة');
        return;
      }
      if (!USERNAME_PATTERN.test(un)) {
        toast.error('اسم المستخدم يجب أن يحتوي على أحرف/أرقام فقط');
        return;
      }
      setSaving(true);
      try {
        await apiJson<TeamUserRow>('/api/users', {
          method: 'POST',
          token,
          body: JSON.stringify({
            fullName: fn,
            username: un,
            password,
            safariRole,
            branchId,
          }),
        });
        toast.success('تم إنشاء المستخدم بنجاح');
        setOpen(false);
        setFullName('');
        setUsername('');
        setPassword('');
        setSafariRole('DRIVER');
        setBranchId('');
        await loadUsers();
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        setSaving(false);
      }
    })();
  }

  async function toggleActive(u: TeamUserRow) {
    if (!token) return;
    const nextBranchId = branchDraftByUser[u.id] ?? u.branchId ?? '';
    if (!nextBranchId) {
      toast.error('اختيار الفرع إلزامي');
      return;
    }
    setActionBusyId(u.id);
    try {
      await apiJson<TeamUserRow>(`/api/users/${u.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          isActive: !u.isActive,
          branchId: nextBranchId,
        }),
      });
      toast.success('تم تحديث الحالة');
      await loadUsers();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setActionBusyId(null);
    }
  }

  async function saveBranchAssignment(u: TeamUserRow) {
    if (!token) return;
    const nextBranchId = branchDraftByUser[u.id] ?? '';
    if (!nextBranchId) {
      toast.error('اختيار الفرع إلزامي');
      return;
    }
    setActionBusyId(u.id);
    try {
      await apiJson<TeamUserRow>(`/api/users/${u.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ branchId: nextBranchId }),
      });
      toast.success('تم حفظ ربط الفرع');
      await loadUsers();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setActionBusyId(null);
    }
  }

  async function resetPassword(u: TeamUserRow) {
    if (!token) return;
    const next = window.prompt('أدخل كلمة المرور الجديدة');
    if (!next || next.trim().length < 1) return;
    const nextBranchId = branchDraftByUser[u.id] ?? u.branchId ?? '';
    if (!nextBranchId) {
      toast.error('اختيار الفرع إلزامي');
      return;
    }
    setActionBusyId(u.id);
    try {
      await apiJson<TeamUserRow>(`/api/users/${u.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          password: next,
          branchId: nextBranchId,
        }),
      });
      toast.success('تمت إعادة تعيين كلمة المرور');
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <Card className="border-slate-300 bg-white text-slate-950 shadow-sm [font-family:'Tajawal',sans-serif]">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-950">
          <Users className="h-4 w-4" />
          إدارة الموظفين
        </CardTitle>
        <Button className="bg-slate-900 text-white hover:bg-slate-800" onClick={() => setOpen(true)}>
          <UserPlus className="me-2 h-4 w-4" />
          إضافة مستخدم
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-7 w-7 animate-spin text-slate-700" />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-100/90 hover:bg-slate-100/90">
                  <TableHead className="font-bold text-slate-950">Name</TableHead>
                  <TableHead className="font-bold text-slate-950">Username</TableHead>
                  <TableHead className="font-bold text-slate-950">Role</TableHead>
                  <TableHead className="font-bold text-slate-950">Branch</TableHead>
                  <TableHead className="font-bold text-slate-950">Status</TableHead>
                  <TableHead className="text-end font-bold text-slate-950">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-semibold text-slate-900">{u.fullName}</TableCell>
                    <TableCell className="text-slate-800">@{u.username}</TableCell>
                    <TableCell className="text-slate-800">{u.safariRole}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          value={branchDraftByUser[u.id] ?? ''}
                          onValueChange={(v) =>
                            setBranchDraftByUser((prev) => ({ ...prev, [u.id]: v ?? '' }))
                          }
                          disabled={actionBusyId === u.id}
                        >
                          <SelectTrigger className="w-[190px] bg-white text-slate-900">
                            <SelectValue placeholder="اختر الفرع" />
                          </SelectTrigger>
                          <SelectContent>
                            {branches.map((b) => (
                              <SelectItem key={b.id} value={b.id}>
                                {b.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-slate-400 text-slate-900"
                          disabled={actionBusyId === u.id}
                          onClick={() => void saveBranchAssignment(u)}
                        >
                          <Save className="me-1 h-4 w-4" />
                          حفظ
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          u.isActive
                            ? 'rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800'
                            : 'rounded-full bg-rose-100 px-2 py-1 text-xs font-bold text-rose-800'
                        }
                      >
                        {u.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="inline-flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-slate-400 text-slate-900"
                          disabled={actionBusyId === u.id}
                          onClick={() => void toggleActive(u)}
                        >
                          <Power className="me-1 h-4 w-4" />
                          {u.isActive ? 'تعطيل' : 'تفعيل'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-amber-500 text-amber-900"
                          disabled={actionBusyId === u.id}
                          onClick={() => void resetPassword(u)}
                        >
                          <RotateCcwKey className="me-1 h-4 w-4" />
                          إعادة تعيين كلمة المرور
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md [font-family:'Tajawal',sans-serif]">
          <form onSubmit={onCreate}>
            <DialogHeader>
              <DialogTitle>إضافة مستخدم جديد</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="space-y-1.5">
                <Label>الاسم الكامل</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>اسم المستخدم</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>كلمة المرور</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>ربط الفرع</Label>
                <Select value={branchId} onValueChange={(v) => setBranchId(v ?? '')}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="اختر الفرع" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>الدور</Label>
                <Select value={safariRole} onValueChange={(v) => setSafariRole(v as SafariRole)}>
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={!canSubmit || saving} className="bg-slate-900 text-white hover:bg-slate-800">
                {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                إنشاء
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
