import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { apiJson, ApiError, type BranchRow } from '@/lib/api';
import { requestBranchesListRefresh } from '@/lib/branch-list-refresh';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';
import { Switch } from '@/modules/shared/components/ui/switch';

/**
 * V18.0 — System Settings → Branch Management (OWNER-only).
 *
 * Surfaces the full branch list and the "Add branch" action the user asked
 * to have restored. POST /api/branches is already gated to OWNER on the
 * backend; we also hide the page via nav config + route guard.
 */
export function BranchesPage() {
  const { t } = useTranslation();
  const { token, hasRole } = useAuth();
  const isOwner = hasRole('OWNER') ?? false;

  const [rows, setRows] = useState<BranchRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [isActive, setIsActive] = useState(true);

  const load = useCallback(() => {
    if (!token || !isOwner) return;
    setLoading(true);
    void apiJson<BranchRow[]>('/api/branches', { token })
      .then((res) => setRows(Array.isArray(res) ? res : []))
      .catch((e) => {
        if (e instanceof ApiError) toast.error(e.message);
      })
      .finally(() => setLoading(false));
  }, [token, isOwner]);

  useEffect(() => {
    load();
  }, [load]);

  const sortedRows = useMemo(
    () =>
      [...(rows ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ),
    [rows],
  );

  function resetForm() {
    setName('');
    setLocation('');
    setPhone('');
    setIsActive(true);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    const trimmedName = name.trim();
    const trimmedLocation = location.trim();
    if (!trimmedName || !trimmedLocation) {
      toast.error(t('branchesPage.errRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await apiJson('/api/branches', {
        token,
        method: 'POST',
        body: JSON.stringify({
          name: trimmedName,
          location: trimmedLocation,
          phone: phone.trim() || undefined,
          isActive,
        }),
      });
      toast.success(t('branchesPage.created'));
      resetForm();
      setDialogOpen(false);
      load();
      requestBranchesListRefresh();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOwner) {
    return (
      <div className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
        {t('branchesPage.ownerOnly')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t('branchesPage.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('branchesPage.subtitle')}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
        >
          <Plus className="me-2 h-4 w-4" aria-hidden />
          {t('branchesPage.addBranch')}
        </Button>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
            {t('branchesPage.tableTitle')}
          </CardTitle>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="table-ltr-numbers overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('branchesPage.colName')}</TableHead>
                  <TableHead>{t('branchesPage.colLocation')}</TableHead>
                  <TableHead>{t('branchesPage.colPhone')}</TableHead>
                  <TableHead>{t('branchesPage.colStatus')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      {loading
                        ? t('branchesPage.loading')
                        : t('branchesPage.empty')}
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedRows.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium text-foreground">
                        {b.name}
                      </TableCell>
                      <TableCell className="text-foreground/90">
                        {b.location}
                      </TableCell>
                      <TableCell className="text-foreground/90 tabular-nums">
                        {b.phone?.trim() || '—'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            b.isActive
                              ? 'inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300'
                              : 'inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground'
                          }
                        >
                          {b.isActive
                            ? t('branchesPage.active')
                            : t('branchesPage.inactive')}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('branchesPage.addBranch')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="branch-name">
                {t('branchesPage.fieldName')}
              </Label>
              <Input
                id="branch-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('branchesPage.fieldNamePh')}
                maxLength={200}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-location">
                {t('branchesPage.fieldLocation')}
              </Label>
              <Input
                id="branch-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t('branchesPage.fieldLocationPh')}
                maxLength={500}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-phone">
                {t('branchesPage.fieldPhone')}
              </Label>
              <Input
                id="branch-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t('branchesPage.fieldPhonePh')}
                maxLength={40}
                inputMode="tel"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium">
                  {t('branchesPage.fieldActive')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('branchesPage.fieldActiveHint')}
                </p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                aria-label={t('branchesPage.fieldActive')}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => setDialogOpen(false)}
              >
                {t('branchesPage.cancel')}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                {t('branchesPage.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
