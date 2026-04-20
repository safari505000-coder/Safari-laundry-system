import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import {
  type SubscriptionPlan,
  apiJson,
  ApiError,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { computeSubscriptionTotals } from '@/utils/finance-engine';
import { Badge } from '@/modules/shared/components/ui/badge';
import { Button, buttonVariants } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
} from '@/modules/shared/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/modules/shared/components/ui/dialog';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import { Switch } from '@/modules/shared/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';

/**
 * V19.4 â€” CC cleanup. `/subscriptions` is now the executive plan catalog
 * *only*. Every Call-Center activation / debt / rollover / history
 * surface used to have a duplicate tab here; it was the long-standing
 * "old system" that confused agents because the two entry points
 * diverged over time. The canonical Call-Center workflow now lives
 * entirely on `/subscribers`, `/customers`, and `/collections`. The
 * access matrix reflects this: `subscriptions.view` + `.manage` are
 * OWNER / GENERAL_MANAGER only.
 */

export function SubscriptionsPage() {
  const { t } = useTranslation();
  const { token, hasRole } = useAuth();
  const isOwner = hasRole('OWNER', 'GENERAL_MANAGER');

  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(false);

  const loadOwnerPlans = useCallback(async () => {
    if (!token || !isOwner) return;
    setLoadingPlans(true);
    try {
      const data = await apiJson<SubscriptionPlan[]>('/api/subscription-plans', {
        token,
      });
      setPlans(data);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoadingPlans(false);
    }
  }, [token, isOwner]);

  useEffect(() => {
    void loadOwnerPlans();
  }, [loadOwnerPlans]);

  // Defence in depth â€” the <RequireAccess> route guard already enforces
  // this, but if an intermediate role sneaks in we still bounce home.
  if (!isOwner) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t('subscriptions.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('subscriptions.subtitle')}
        </p>
      </header>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {t('subscriptions.ownerHint')}
          </p>
          <CreatePlanDialog token={token!} onCreated={loadOwnerPlans} />
        </div>
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-0">
            {loadingPlans && !plans ? (
              <div className="p-6 space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t('subscriptions.colPlan')}</TableHead>
                    <TableHead>{t('subscriptions.colPay')}</TableHead>
                    <TableHead>{t('subscriptions.colCredit')}</TableHead>
                    <TableHead>{t('subscriptions.colSubsidy')}</TableHead>
                    <TableHead>{t('subscriptions.colValidity')}</TableHead>
                    <TableHead>{t('subscriptions.colStatus')}</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans?.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="tabular-nums">
                        {formatKwdLabel(p.salePrice)}
                      </TableCell>
                      <TableCell className="tabular-nums text-emerald-700">
                        {formatKwdLabel(p.actualBalance)}
                      </TableCell>
                      <TableCell className="tabular-nums text-amber-700">
                        {formatKwdLabel(
                          computeSubscriptionTotals({
                            salePrice: p.salePrice,
                            actualBalance: p.actualBalance,
                          }).subsidy.toFixed(4),
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">
                        {p.validityDays}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={p.isActive ? 'default' : 'secondary'}
                        >
                          {p.isActive
                            ? t('subscriptions.active')
                            : t('subscriptions.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <PlanActiveSwitch
                          token={token!}
                          plan={p}
                          onUpdated={loadOwnerPlans}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CreatePlanDialog({
  token,
  onCreated,
}: {
  token: string;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [credit, setCredit] = useState('');
  const [validityDays, setValidityDays] = useState('30');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const p = Number.parseFloat(salePrice);
    const c = Number.parseFloat(credit);
    const vd = Number.parseInt(validityDays, 10);
    if (
      !name.trim() ||
      !Number.isFinite(p) ||
      p <= 0 ||
      !Number.isFinite(c) ||
      c <= 0 ||
      !Number.isFinite(vd) ||
      vd <= 0
    ) {
      toast.error(t('subscriptions.validationPlan'));
      return;
    }
    setSaving(true);
    try {
      await apiJson<SubscriptionPlan>('/api/subscription-plans', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: name.trim(),
          salePrice: p,
          actualBalance: c,
          validityDays: vd,
          isActive: active,
        }),
      });
      toast.success(t('subscriptions.planCreated'));
      setOpen(false);
      setName('');
      setSalePrice('');
      setCredit('');
      setValidityDays('30');
      setActive(true);
      onCreated();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={buttonVariants({
          className: 'bg-primary text-primary-foreground hover:bg-primary/90',
        })}
      >
        {t('subscriptions.newPlan')}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('subscriptions.dialogTitle')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="pname">{t('subscriptions.name')}</Label>
            <Input
              id="pname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('subscriptions.namePh')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pprice">{t('subscriptions.pricePay')}</Label>
              <Input
                id="pprice"
                type="number"
                step="0.0001"
                min="0"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                placeholder="20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pcredit">{t('subscriptions.walletCredit')}</Label>
              <Input
                id="pcredit"
                type="number"
                step="0.0001"
                min="0"
                value={credit}
                onChange={(e) => setCredit(e.target.value)}
                placeholder="25"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pvalid">{t('subscriptions.validityDays')}</Label>
            <Input
              id="pvalid"
              type="number"
              min={1}
              step={1}
              value={validityDays}
              onChange={(e) => setValidityDays(e.target.value)}
              placeholder="30"
            />
            <p className="text-xs text-muted-foreground">{t('subscriptions.validityDaysHint')}</p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label htmlFor="pactive" className="cursor-pointer">
              {t('subscriptions.activeInCatalog')}
            </Label>
            <Switch
              id="pactive"
              checked={active}
              onCheckedChange={setActive}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('subscriptions.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? t('subscriptions.saving') : t('subscriptions.createPlan')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanActiveSwitch({
  token,
  plan,
  onUpdated,
}: {
  token: string;
  plan: SubscriptionPlan;
  onUpdated: () => void;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);

  async function toggle(next: boolean) {
    setPending(true);
    try {
      await apiJson<SubscriptionPlan>(`/api/subscription-plans/${plan.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ isActive: next }),
      });
      toast.success(
        next ? t('subscriptions.planActivated') : t('subscriptions.planDeactivated'),
      );
      onUpdated();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex justify-end">
      <Switch
        checked={plan.isActive}
        disabled={pending}
        onCheckedChange={(v) => void toggle(v)}
      />
    </div>
  );
}
