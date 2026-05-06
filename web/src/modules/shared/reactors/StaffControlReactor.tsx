import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Loader2,
  Pencil,
  Power,
  RotateCcwKey,
  Save,
  UserPlus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { BranchRow, SafariRole, TeamUserRow } from '@/lib/api';
import {
  apiJson,
  ApiError,
  resetUserPassword,
  resetUserPasswordsBulk,
} from '@/lib/api';
import { Button } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { Checkbox } from '@/modules/shared/components/ui/checkbox';
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
  'CALL_CENTER_SUPERVISOR',
  'FLEET_SUPERVISOR',
  'ACCOUNTANT',
  'SUPERVISOR',
  'VIEWER',
];

const USERNAME_PATTERN = /^[\w.-]+$/;

type Props = {
  token: string | null;
};

export function StaffControlReactor({ token }: Props) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<TeamUserRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [branchDraftByUser, setBranchDraftByUser] = useState<Record<string, string>>({});
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [resetTarget, setResetTarget] = useState<TeamUserRow | null>(null);
  const [bulkResetOpen, setBulkResetOpen] = useState(false);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetSaving, setResetSaving] = useState(false);

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [safariRole, setSafariRole] = useState<SafariRole>('DRIVER');
  const [branchId, setBranchId] = useState<string>('');
  const [jobTitleCreate, setJobTitleCreate] = useState('');
  const [saving, setSaving] = useState(false);

  const canSubmit = useMemo(
    () => fullName.trim().length >= 2 && username.trim().length >= 2 && password.length >= 1 && branchId.length > 0,
    [branchId, fullName, password.length, username],
  );

  const passwordResetToast =
    'تم إعادة تعيين كلمة المرور ويجب تغييرها عند تسجيل الدخول';

  const resetPasswordMatches =
    resetNewPassword.length >= 6 && resetNewPassword === resetConfirmPassword;

  // V19.0 — resolve branch UUID → human name so the Select trigger never falls
  // back to the raw id. If branches haven't loaded yet the placeholder shows.
  const branchNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const b of branches) map[b.id] = b.name;
    return map;
  }, [branches]);

  // V19.0 — Arabic-first role label (with English fallback via i18n) so the
  // dropdown reads "مدير عام" instead of "GENERAL_MANAGER".
  const roleLabel = useCallback(
    (role: SafariRole): string => {
      const translated = t(`roles.${role}`, { defaultValue: '' });
      return translated && translated !== `roles.${role}` ? translated : role;
    },
    [t],
  );

  const loadUsers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiJson<TeamUserRow[]>('/api/users', { token });
      const safe = Array.isArray(data) ? data : [];
      setUsers(safe);
      setSelectedUserIds((prev) =>
        prev.filter((id) => safe.some((u) => u.id === id)),
      );
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
            ...(jobTitleCreate.trim() ? { jobTitle: jobTitleCreate.trim() } : {}),
          }),
        });
        toast.success('تم إنشاء المستخدم بنجاح');
        setOpen(false);
        setFullName('');
        setUsername('');
        setPassword('');
        setSafariRole('DRIVER');
        setBranchId('');
        setJobTitleCreate('');
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
    setActionBusyId(u.id);
    try {
      // Dedicated soft-lock endpoint (GM available, OWNER-protected).
      // Unlike the generic `PATCH /users/:id`, this one only flips
      // `isActive` and cannot leak into role/branch/password mutation.
      await apiJson<TeamUserRow>(`/api/users/${u.id}/status`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ isActive: !u.isActive }),
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

  async function editJobTitle(u: TeamUserRow) {
    if (!token) return;
    const next = window.prompt('المهنة / المسمى الوظيفي', u.jobTitle ?? '');
    if (next === null) return;
    const trimmed = next.trim();
    if ((u.jobTitle ?? '').trim() === trimmed) return;
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
          jobTitle: trimmed.length ? trimmed : '',
          branchId: nextBranchId,
        }),
      });
      toast.success('تم تحديث المهنة');
      await loadUsers();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setActionBusyId(null);
    }
  }

  async function renameUsername(u: TeamUserRow) {
    if (!token) return;
    const next = window.prompt(
      'اسم المستخدم الجديد (أحرف / أرقام / . _ - فقط)',
      u.username,
    );
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed.length < 2) {
      toast.error('اسم المستخدم قصير جداً');
      return;
    }
    if (!USERNAME_PATTERN.test(trimmed)) {
      toast.error('اسم المستخدم يجب أن يحتوي على أحرف/أرقام/نقطة/شرطة فقط');
      return;
    }
    if (trimmed === u.username) return;
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
          username: trimmed,
          branchId: nextBranchId,
        }),
      });
      toast.success('تم تغيير اسم المستخدم');
      await loadUsers();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setActionBusyId(null);
    }
  }

  function openResetPassword(u: TeamUserRow) {
    setResetTarget(u);
    setResetNewPassword('');
    setResetConfirmPassword('');
  }

  function closePasswordDialogs() {
    setResetTarget(null);
    setBulkResetOpen(false);
    setResetNewPassword('');
    setResetConfirmPassword('');
  }

  async function submitSinglePasswordReset(e: FormEvent) {
    e.preventDefault();
    if (!token || !resetTarget) return;
    if (!resetPasswordMatches) {
      toast.error('تأكد من أن كلمة المرور 6 أحرف على الأقل ومتطابقة');
      return;
    }
    setResetSaving(true);
    setActionBusyId(resetTarget.id);
    try {
      await resetUserPassword(token, resetTarget.id, resetNewPassword);
      toast.success(passwordResetToast);
      closePasswordDialogs();
      await loadUsers();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setResetSaving(false);
      setActionBusyId(null);
    }
  }

  async function submitBulkPasswordReset(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (selectedUserIds.length === 0) {
      toast.error('اختر مستخدماً واحداً على الأقل');
      return;
    }
    if (!resetPasswordMatches) {
      toast.error('تأكد من أن كلمة المرور 6 أحرف على الأقل ومتطابقة');
      return;
    }
    setResetSaving(true);
    try {
      await resetUserPasswordsBulk(token, selectedUserIds, resetNewPassword);
      toast.success(passwordResetToast);
      closePasswordDialogs();
      setSelectedUserIds([]);
      await loadUsers();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setResetSaving(false);
    }
  }

  function toggleSelected(userId: string, checked: boolean) {
    setSelectedUserIds((prev) =>
      checked ?
        [...new Set([...prev, userId])]
      : prev.filter((id) => id !== userId),
    );
  }

  return (
    <Card className="border-slate-300 bg-white text-slate-950 shadow-sm [font-family:'Tajawal',sans-serif]">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-950">
          <Users className="h-4 w-4" />
          إدارة الموظفين
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="border-amber-500 text-amber-900"
            disabled={selectedUserIds.length === 0}
            onClick={() => {
              setResetNewPassword('');
              setResetConfirmPassword('');
              setBulkResetOpen(true);
            }}
          >
            <RotateCcwKey className="me-2 h-4 w-4" />
            إعادة تعيين جماعي ({selectedUserIds.length})
          </Button>
          <Button className="bg-slate-900 text-white hover:bg-slate-800" onClick={() => setOpen(true)}>
            <UserPlus className="me-2 h-4 w-4" />
            إضافة مستخدم
          </Button>
        </div>
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
                  <TableHead className="w-10 font-bold text-slate-950">
                    <Checkbox
                      checked={
                        users.length > 0 && selectedUserIds.length === users.length
                      }
                      onCheckedChange={(v) => {
                        setSelectedUserIds(v === true ? users.map((u) => u.id) : []);
                      }}
                      aria-label="تحديد كل المستخدمين"
                    />
                  </TableHead>
                  <TableHead className="font-bold text-slate-950">Name</TableHead>
                  <TableHead className="font-bold text-slate-950">Username</TableHead>
                  <TableHead className="font-bold text-slate-950">المهنة</TableHead>
                  <TableHead className="font-bold text-slate-950">Role</TableHead>
                  <TableHead className="font-bold text-slate-950">Branch</TableHead>
                  <TableHead className="font-bold text-slate-950">Status</TableHead>
                  <TableHead className="text-end font-bold text-slate-950">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedUserIds.includes(u.id)}
                        onCheckedChange={(v) => toggleSelected(u.id, v === true)}
                        aria-label={`تحديد ${u.fullName}`}
                      />
                    </TableCell>
                    <TableCell className="font-semibold text-slate-900">{u.fullName}</TableCell>
                    <TableCell className="text-slate-800">
                      <div className="inline-flex items-center gap-1.5">
                        <span>@{u.username}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-slate-600 hover:text-slate-900"
                          title="تعديل اسم المستخدم"
                          aria-label="تعديل اسم المستخدم"
                          disabled={actionBusyId === u.id}
                          onClick={() => void renameUsername(u)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-800">
                      <div className="inline-flex max-w-[220px] items-center gap-1.5">
                        <span className="truncate" title={u.jobTitle ?? undefined}>
                          {u.jobTitle?.trim() ? u.jobTitle : '—'}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 shrink-0 p-0 text-slate-600 hover:text-slate-900"
                          title="تعديل المهنة"
                          aria-label="تعديل المهنة"
                          disabled={actionBusyId === u.id}
                          onClick={() => void editJobTitle(u)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-800">{roleLabel(u.safariRole)}</TableCell>
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
                            {branchDraftByUser[u.id] && branchNameById[branchDraftByUser[u.id]!] ? (
                              <span>{branchNameById[branchDraftByUser[u.id]!]}</span>
                            ) : (
                              <SelectValue placeholder="اختر الفرع" />
                            )}
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
                          onClick={() => openResetPassword(u)}
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
                <Label>المهنة (اختياري)</Label>
                <Input
                  value={jobTitleCreate}
                  onChange={(e) => setJobTitleCreate(e.target.value)}
                  placeholder="مثال: سائق، أخصائي، …"
                />
              </div>
              <div className="space-y-1.5">
                <Label>كلمة المرور</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>ربط الفرع (اسم الفرع)</Label>
                <Select value={branchId} onValueChange={(v) => setBranchId(v ?? '')}>
                  <SelectTrigger className="bg-white">
                    {branchId && branchNameById[branchId] ? (
                      <span className="text-slate-900">{branchNameById[branchId]}</span>
                    ) : (
                      <SelectValue placeholder="اختر الفرع" />
                    )}
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
                    <span className="text-slate-900">{roleLabel(safariRole)}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {roleLabel(r)}
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

      <Dialog open={resetTarget !== null} onOpenChange={(v) => !v && closePasswordDialogs()}>
        <DialogContent className="sm:max-w-md [font-family:'Tajawal',sans-serif]">
          <form onSubmit={submitSinglePasswordReset}>
            <DialogHeader>
              <DialogTitle>إعادة تعيين كلمة المرور</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-3">
              <p className="text-sm text-slate-600">
                المستخدم: <span className="font-bold text-slate-900">{resetTarget?.fullName}</span>
              </p>
              <div className="space-y-1.5">
                <Label>كلمة المرور الجديدة</Label>
                <Input
                  type="password"
                  minLength={6}
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>تأكيد كلمة المرور</Label>
                <Input
                  type="password"
                  minLength={6}
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closePasswordDialogs}>
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={!resetPasswordMatches || resetSaving}
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                {resetSaving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                إعادة التعيين
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkResetOpen} onOpenChange={(v) => !v && closePasswordDialogs()}>
        <DialogContent className="sm:max-w-md [font-family:'Tajawal',sans-serif]">
          <form onSubmit={submitBulkPasswordReset}>
            <DialogHeader>
              <DialogTitle>إعادة تعيين جماعي لكلمات المرور</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-3">
              <p className="text-sm text-slate-600">
                سيتم تطبيق كلمة مرور مؤقتة على {selectedUserIds.length} مستخدم/مستخدمين، وسيُطلب تغييرها عند تسجيل الدخول.
              </p>
              <div className="space-y-1.5">
                <Label>كلمة المرور الجديدة</Label>
                <Input
                  type="password"
                  minLength={6}
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>تأكيد كلمة المرور</Label>
                <Input
                  type="password"
                  minLength={6}
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closePasswordDialogs}>
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={!resetPasswordMatches || resetSaving || selectedUserIds.length === 0}
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                {resetSaving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                تطبيق على الجميع
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
