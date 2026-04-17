import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Building, Loader2, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { type BranchRow, apiJson, ApiError } from '@/lib/api';
import { requestBranchesListRefresh } from '@/lib/branch-list-refresh';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { Badge } from '@/modules/shared/components/ui/badge';
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
import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';

export function BranchesPage() {
  const { t } = useTranslation();
  const dateLocale = useAppLocale();
  const { token, hasRole } = useAuth();
  const [rows, setRows] = useState<BranchRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  const load = useCallback(async () => {
    if (!token || !hasRole('OWNER')) return;
    setLoading(true);
    try {
      const data = await apiJson<BranchRow[]>('/api/branches', { token });
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, hasRole]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setName('');
    setLocation('');
    setPhone('');
    setStatus('active');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const n = name.trim();
    const loc = location.trim();
    if (n.length < 1 || loc.length < 1) {
      toast.error(t('branches.validation'));
      return;
    }
    setSaving(true);
    try {
      await apiJson<BranchRow>('/api/branches', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: n,
          location: loc,
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          isActive: status === 'active',
        }),
      });
      toast.success(t('branches.saved'));
      resetForm();
      setDialogOpen(false);
      void load();
      requestBranchesListRefresh();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!hasRole('OWNER')) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t('branches.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('branches.subtitle')}</p>
        </div>
        <Button
          type="button"
          className="gap-2 self-start sm:self-auto"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t('branches.addNew')}
        </Button>
      </header>

      <Card className="rounded-[20px] border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building className="h-4 w-4 text-primary" aria-hidden />
            {t('branches.listTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading && !rows ?
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          : !rows?.length ?
            <p className="p-6 text-sm text-muted-foreground">{t('branches.empty')}</p>
          : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('branches.colName')}</TableHead>
                  <TableHead>{t('branches.colLocation')}</TableHead>
                  <TableHead>{t('branches.colPhone')}</TableHead>
                  <TableHead>{t('branches.colStatus')}</TableHead>
                  <TableHead className="text-muted-foreground">
                    {t('branches.colUpdated')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium text-foreground">{b.name}</TableCell>
                    <TableCell className="max-w-[240px] text-muted-foreground">
                      <span className="line-clamp-2">{b.location}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {b.phone?.trim() || 'â€”'}
                    </TableCell>
                    <TableCell>
                      {b.isActive ?
                        <Badge>{t('branches.statusActive')}</Badge>
                      : <Badge variant="secondary">{t('branches.statusInactive')}</Badge>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(b.updatedAt).toLocaleString(dateLocale, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) resetForm();
          setDialogOpen(o);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(e) => void submit(e)}>
            <DialogHeader>
              <DialogTitle>{t('branches.dialogTitle')}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="br-name">{t('branches.fieldName')}</Label>
                <Input
                  id="br-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="organization"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="br-loc">{t('branches.fieldLocation')}</Label>
                <Input
                  id="br-loc"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="br-phone">{t('branches.fieldPhone')}</Label>
                <Input
                  id="br-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('branches.phoneOptional')}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('branches.fieldStatus')}</Label>
                <Select
                  value={status}
                  onValueChange={(v) =>
                    setStatus(v === 'inactive' ? 'inactive' : 'active')
                  }
                >
                  <SelectTrigger id="br-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t('branches.statusActive')}</SelectItem>
                    <SelectItem value="inactive">
                      {t('branches.statusInactive')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetForm();
                  setDialogOpen(false);
                }}
                disabled={saving}
              >
                {t('branches.cancel')}
              </Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving ?
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                : null}
                {t('branches.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

