import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Power, Trash2, UserPlus, Users } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type SafariRole,
  type TeamUserRow,
  apiJson,
  ApiError,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const ROLE_OPTIONS: SafariRole[] = [
  'OWNER',
  'MANAGER',
  'DRIVER',
  'CALL_CENTER',
  'ACCOUNTANT',
  'SUPERVISOR',
  'VIEWER',
];

const USERNAME_PATTERN = /^[\w.-]+$/;

export function TeamPage() {
  const { t } = useTranslation();
  const { token, hasRole } = useAuth();
  const [users, setUsers] = useState<TeamUserRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [safariRole, setSafariRole] = useState<SafariRole>('DRIVER');
  const [saving, setSaving] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiJson<TeamUserRow[]>('/api/users', { token });
      setUsers(data);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  if (!hasRole('OWNER')) {
    return <Navigate to="/" replace />;
  }

  function submitCreate() {
    void (async () => {
      if (!token) {
        toast.error(t('team.noSession'));
        return;
      }
      const fn = fullName.trim();
      const un = username.trim();
      if (fn.length < 2 || un.length < 2 || password.length < 1) {
        toast.error(t('team.validation'));
        return;
      }
      if (!USERNAME_PATTERN.test(un)) {
        toast.error(t('team.usernameInvalid'));
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
          }),
        });
        toast.success(t('team.created'));
        setOpen(false);
        setFullName('');
        setUsername('');
        setPassword('');
        setSafariRole('DRIVER');
        void loadUsers();
      } catch (e) {
        console.error('[team] create user failed', e);
        if (e instanceof ApiError) {
          toast.error(e.message || t('team.errorGeneric'));
        } else if (e instanceof Error) {
          toast.error(e.message || t('team.errorGeneric'));
        } else {
          toast.error(t('team.errorGeneric'));
        }
      } finally {
        setSaving(false);
      }
    })();
  }

  function onDialogSubmit(e: FormEvent) {
    e.preventDefault();
    submitCreate();
  }

  async function toggleUserActive(u: TeamUserRow) {
    if (!token) return;
    setActionBusyId(u.id);
    try {
      await apiJson<TeamUserRow>(`/api/users/${u.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      toast.success(t('team.statusUpdated'));
      await loadUsers();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setActionBusyId(null);
    }
  }

  async function deleteUser(u: TeamUserRow) {
    if (!token) return;
    if (!window.confirm(t('team.confirmDelete'))) return;
    setActionBusyId(u.id);
    try {
      await apiJson<{ id: string; deleted: boolean }>(`/api/users/${u.id}`, {
        method: 'DELETE',
        token,
      });
      toast.success(t('team.deleted'));
      await loadUsers();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            {t('team.title')}
          </h1>
          <p className="text-sm text-zinc-500">{t('team.subtitle')}</p>
        </div>
        <Button
          type="button"
          className="gap-2 bg-zinc-900 text-white hover:bg-zinc-800"
          onClick={() => setOpen(true)}
        >
          <UserPlus className="h-4 w-4" />
          {t('team.addMember')}
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md">
            <form onSubmit={onDialogSubmit}>
              <DialogHeader>
                <DialogTitle>{t('team.dialogTitle')}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="space-y-2">
                  <Label htmlFor="team-fn">{t('team.fullName')}</Label>
                  <Input
                    id="team-fn"
                    name="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="bg-white"
                    disabled={saving}
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="team-un">{t('team.username')}</Label>
                  <Input
                    id="team-un"
                    name="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    className="bg-white"
                    disabled={saving}
                  />
                  <p className="text-xs text-zinc-500">{t('team.usernameHint')}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="team-pw">{t('team.password')}</Label>
                  <Input
                    id="team-pw"
                    name="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="bg-white"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('team.role')}</Label>
                  <Select
                    value={safariRole}
                    onValueChange={(v) => setSafariRole(v as SafariRole)}
                    disabled={saving}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {t(`roles.${r}`, {
                            defaultValue: r.replace('_', ' '),
                          })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setOpen(false)}
                >
                  {t('subscriptions.cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-zinc-900 text-white hover:bg-zinc-800"
                >
                  {saving ?
                    <>
                      <Loader2
                        className="me-2 size-4 animate-spin"
                        aria-hidden
                      />
                      {t('team.saving')}
                    </>
                  : t('team.create')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <Card className="border-zinc-200 bg-white shadow-sm">
        <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold">
            <Users className="h-4 w-4" />
            {t('team.directory')}
          </CardTitle>
          <CardDescription>{t('team.directoryHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ?
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          : <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('team.colName')}</TableHead>
                  <TableHead>{t('team.colUsername')}</TableHead>
                  <TableHead>{t('team.colRole')}</TableHead>
                  <TableHead>{t('team.colBranch')}</TableHead>
                  <TableHead>{t('team.colPhone')}</TableHead>
                  <TableHead>{t('team.colStatus')}</TableHead>
                  <TableHead className="text-end">{t('team.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium text-zinc-900">
                      {u.fullName}
                    </TableCell>
                    <TableCell className="text-zinc-600">@{u.username}</TableCell>
                    <TableCell className="text-sm text-zinc-600">
                      {t(`roles.${u.safariRole}`, {
                        defaultValue: u.safariRole.replace('_', ' '),
                      })}
                    </TableCell>
                    <TableCell className="text-sm text-zinc-500">
                      {u.branch?.name ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-zinc-600">
                      {u.phone ?? '—'}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          u.isActive ?
                            'rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700'
                          : 'rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700'
                        }
                      >
                        {u.isActive ? t('team.active') : t('team.inactive')}
                      </span>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="inline-flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-12 border-emerald-500 text-emerald-700 hover:bg-emerald-50"
                          disabled={actionBusyId === u.id}
                          onClick={() => void toggleUserActive(u)}
                        >
                          <Power className="me-1 h-4 w-4" />
                          {u.isActive ? t('team.deactivate') : t('team.activate')}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="min-h-12"
                          disabled={actionBusyId === u.id}
                          onClick={() => void deleteUser(u)}
                        >
                          <Trash2 className="me-1 h-4 w-4" />
                          {t('team.deleteUser')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>}
          {!loading && users?.length === 0 ?
            <p className="py-6 text-center text-sm text-zinc-500">
              {t('team.empty')}
            </p>
          : null}
        </CardContent>
      </Card>
    </div>
  );
}
