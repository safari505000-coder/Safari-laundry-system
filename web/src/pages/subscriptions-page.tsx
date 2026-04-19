import { useCallback, useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import { Gift, Search } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type ActivateSubscriptionResponse,
  type CallCenterPlan,
  type CustomerSearchRow,
  type SettlementHistoryRow,
  type SubscriptionPlan,
  apiJson,
  ApiError,
} from '@/lib/api';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { formatKwdLabel, subtractKwdStrings } from '@/lib/kwd';
import { computeSubscriptionTotals } from '@/utils/finance-engine';
import { Badge } from '@/modules/shared/components/ui/badge';
import { Button, buttonVariants } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import { Separator } from '@/modules/shared/components/ui/separator';
import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import { Switch } from '@/modules/shared/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/shared/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';

export function SubscriptionsPage() {
  const { t } = useTranslation();
  const { token, hasRole } = useAuth();
  const isOwner = hasRole('OWNER', 'GENERAL_MANAGER');
  const isCallCenter = hasRole('CALL_CENTER');

  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [ccPlans, setCcPlans] = useState<CallCenterPlan[] | null>(null);
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

  const loadCcPlans = useCallback(async () => {
    if (!token || !isCallCenter) return;
    try {
      const data = await apiJson<CallCenterPlan[]>(
        '/api/call-center/subscription-plans',
        { token },
      );
      setCcPlans(data);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    }
  }, [token, isCallCenter]);

  useEffect(() => {
    void loadOwnerPlans();
  }, [loadOwnerPlans]);

  useEffect(() => {
    void loadCcPlans();
  }, [loadCcPlans]);

  if (!isOwner && !isCallCenter) {
    return <Navigate to="/" replace />;
  }

  const defaultTab = isOwner ? 'plans' : 'activate';

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {t('subscriptions.title')}
        </h1>
        <p className="text-sm text-zinc-500">{t('subscriptions.subtitle')}</p>
      </header>

      <Tabs defaultValue={defaultTab} className="space-y-6">
        <TabsList
          className={
            isOwner && isCallCenter ?
              'grid w-full max-w-md grid-cols-2 bg-zinc-100/80'
            : 'grid w-full max-w-md grid-cols-1 bg-zinc-100/80'
          }
        >
          {isOwner ?
            <TabsTrigger value="plans" className="text-sm">
              {t('subscriptions.tabPlans')}
            </TabsTrigger>
          : null}
          {isCallCenter ?
            <TabsTrigger value="activate" className="text-sm">
              {t('subscriptions.tabActivate')}
            </TabsTrigger>
          : null}
        </TabsList>

        {isOwner ?
          <TabsContent value="plans" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-zinc-600">
                {t('subscriptions.ownerHint')}
              </p>
              <CreatePlanDialog token={token!} onCreated={loadOwnerPlans} />
            </div>
            <Card className="border-zinc-200 bg-white shadow-sm">
              <CardContent className="p-0">
                {loadingPlans && !plans ?
                  <div className="p-6 space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                : <Table>
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
                              {p.isActive ?
                                t('subscriptions.active')
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
                  </Table>}
              </CardContent>
            </Card>
          </TabsContent>
        : null}

        {isCallCenter ?
          <TabsContent value="activate">
            <CallCenterActivatePanel
              token={token!}
              plans={ccPlans ?? []}
              onReloadPlans={loadCcPlans}
            />
          </TabsContent>
        : null}
      </Tabs>
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
          className: 'bg-zinc-900 text-white hover:bg-zinc-800',
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
            <p className="text-xs text-zinc-500">{t('subscriptions.validityDaysHint')}</p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2">
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

function formatSettlementHistoryLine(
  row: SettlementHistoryRow,
  t: TFunction,
  fmt: (s: string) => string,
): string {
  if (
    row.type === 'SUBSCRIPTION_ACTIVATION' &&
    row.totalCollected &&
    row.debtSettled !== undefined &&
    row.creditedToBalance !== undefined
  ) {
    return t('subscriptions.historySubscription', {
      collected: fmt(row.totalCollected),
      debt: fmt(row.debtSettled),
      balance: fmt(row.creditedToBalance),
    });
  }
  if (row.type === 'ORDER_WALLET_SETTLEMENT') {
    return t('subscriptions.historyOrderWallet', {
      balance: fmt(row.balanceAfter),
      debt: fmt(row.debtAfter),
    });
  }
  return t('subscriptions.historyGeneric', {
    balance: fmt(row.balanceAfter),
    debt: fmt(row.debtAfter),
  });
}

function CallCenterActivatePanel({
  token,
  plans,
  onReloadPlans,
}: {
  token: string;
  plans: CallCenterPlan[];
  onReloadPlans: () => void;
}) {
  const { t } = useTranslation();
  const dateLocale = useAppLocale();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<CustomerSearchRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string>('');
  const [activating, setActivating] = useState(false);
  const [settlements, setSettlements] = useState<SettlementHistoryRow[] | null>(
    null,
  );
  const [settlementsLoading, setSettlementsLoading] = useState(false);
  const [settlementReload, setSettlementReload] = useState(0);
  const [lastReceipt, setLastReceipt] =
    useState<ActivateSubscriptionResponse | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(q.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (debounced.length < 2) {
      setResults(null);
      return;
    }
    let c = false;
    (async () => {
      setSearching(true);
      try {
        const rows = await apiJson<CustomerSearchRow[]>(
          `/api/call-center/customers?q=${encodeURIComponent(debounced)}`,
          { token },
        );
        if (!c) setResults(rows);
      } catch (e) {
        if (!c && e instanceof ApiError) toast.error(e.message);
      } finally {
        if (!c) setSearching(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [debounced, token]);

  useEffect(() => {
    if (!customerId) {
      setSettlements(null);
      return;
    }
    let c = false;
    (async () => {
      setSettlementsLoading(true);
      try {
        const rows = await apiJson<SettlementHistoryRow[]>(
          `/api/call-center/customers/${customerId}/settlements`,
          { token },
        );
        if (!c) setSettlements(rows);
      } catch (e) {
        if (!c && e instanceof ApiError) toast.error(e.message);
      } finally {
        if (!c) setSettlementsLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [customerId, token, settlementReload]);

  const selectedCustomer = results?.find((r) => r.id === customerId);

  async function activate() {
    if (!customerId || !planId) {
      toast.error(t('subscriptions.selectCustomerPlan'));
      return;
    }
    setActivating(true);
    try {
      const res = await apiJson<ActivateSubscriptionResponse>(
        '/api/call-center/subscriptions/activate',
        {
          method: 'POST',
          token,
          body: JSON.stringify({ customerId, planId }),
        },
      );
      setLastReceipt(res);
      setResults((prev) =>
        prev ?
          prev.map((r) =>
            r.id === customerId ?
              { ...r, wallet: res.wallet }
            : r,
          )
        : prev,
      );
      setSettlementReload((x) => x + 1);
      toast.success(
        t('subscriptions.historySubscription', {
          collected: formatKwdLabel(res.settlement.totalCollected),
          debt: formatKwdLabel(res.settlement.debtSettled),
          balance: formatKwdLabel(res.settlement.creditedToBalance),
        }),
      );
      void onReloadPlans();
      setPlanId('');
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setActivating(false);
    }
  }

  const s = lastReceipt?.settlement;
  const netAfterDebt =
    s ?
      subtractKwdStrings(s.totalCollected, s.debtSettled)
    : '0.0000';

  return (
    <div className="space-y-8">
      <style>
        {`
          @media print {
            body * { visibility: hidden; }
            #print-subscription-invoice, #print-subscription-invoice * { visibility: visible; }
            #print-subscription-invoice { position: absolute; left: 0; top: 0; width: 100%; }
          }
        `}
      </style>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4" />
              {t('subscriptions.findCustomer')}
            </CardTitle>
            <CardDescription>
              {t('subscriptions.findCustomerHint')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder={t('subscriptions.searchPh')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="bg-white"
            />
            {searching ?
              <p className="text-xs text-zinc-500">
                {t('subscriptions.searching')}
              </p>
            : null}
            <div className="max-h-64 space-y-1 overflow-auto rounded-lg border border-zinc-100 bg-zinc-50/50 p-1">
              {results?.length === 0 ?
                <p className="p-3 text-sm text-zinc-500">
                  {t('subscriptions.noMatches')}
                </p>
              : results?.map((r) => {
                  const bal = Number.parseFloat(r.wallet?.balance ?? '0');
                  const isLowBalance = Number.isFinite(bal) && bal < 10;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setCustomerId(r.id)}
                      className={`w-full rounded-md px-3 py-2.5 text-start text-sm transition-colors ${
                        customerId === r.id ?
                          'bg-zinc-900 text-white'
                        : 'hover:bg-white'
                      }`}
                    >
                      <div className="font-medium">
                        {r.phone}
                        {r.phone2 ? ` · ${r.phone2}` : ''}
                      </div>
                      <div className="text-xs opacity-80">
                        {r.address ?? t('subscriptions.noAddress')} ·{' '}
                        {t('subscriptions.balance')}{' '}
                        <span className={isLowBalance ? 'font-semibold text-red-700' : ''}>
                          {r.wallet ?
                            formatKwdLabel(r.wallet.balance)
                          : formatKwdLabel('0.0000')}
                        </span>
                        {r.wallet && Number.parseFloat(r.wallet.debt) > 0 ?
                          <>
                            {' '}
                            · {t('subscriptions.debtLabel')}{' '}
                            {formatKwdLabel(r.wallet.debt)}
                          </>
                        : null}
                        {isLowBalance ?
                          <>
                            {' '}
                            ·{' '}
                            <span className="font-semibold text-red-700">
                              {t('subscribers.lowBalanceWarn')}
                            </span>
                          </>
                        : null}
                      </div>
                    </button>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white shadow-sm ring-1 ring-amber-500/15">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gift className="h-4 w-4 text-amber-600" />
              {t('subscriptions.activateTitle')}
            </CardTitle>
            <CardDescription>{t('subscriptions.activateHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('subscriptions.planLabel')}</Label>
              {plans.length === 0 ?
                <p className="text-sm text-amber-800">
                  {t('subscriptions.noPlansHint')}
                </p>
              : <Select
                  value={planId}
                  onValueChange={(v) => setPlanId(v ?? '')}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder={t('subscriptions.choosePlan')} />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — pay {p.salePrice} → credit {p.actualBalance}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>}
            </div>
            {selectedCustomer ?
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {t('subscriptions.selected')}
                </p>
                <p className="font-medium text-zinc-900">
                  {selectedCustomer.phone}
                </p>
              </div>
            : <p className="text-sm text-zinc-500">
                {t('subscriptions.selectCustomerHint')}
              </p>}
            <Separator />
            <Button
              className="w-full bg-amber-600 text-white hover:bg-amber-700"
              disabled={activating || !customerId || !planId}
              onClick={() => void activate()}
            >
              {activating ?
                t('subscriptions.activating')
              : t('subscriptions.activateBtn')}
            </Button>
          </CardContent>
        </Card>
      </div>

      {customerId ?
        <Card className="border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              {t('subscriptions.settlementHistoryTitle')}
            </CardTitle>
            <CardDescription>
              {t('subscriptions.settlementHistoryHint')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {settlementsLoading ?
              <Skeleton className="h-16 w-full" />
            : settlements?.length === 0 ?
              <p className="text-sm text-zinc-500">
                {t('subscriptions.noSettlements')}
              </p>
            : <ul className="space-y-2 text-sm text-zinc-700">
                {settlements?.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2"
                  >
                    <p className="text-xs text-zinc-500">
                      {new Date(row.createdAt).toLocaleString(dateLocale)}
                    </p>
                    <p>
                      {formatSettlementHistoryLine(row, t, formatKwdLabel)}
                    </p>
                  </li>
                ))}
              </ul>}
          </CardContent>
        </Card>
      : null}

      {lastReceipt && s ?
        <Card
          id="print-subscription-invoice"
          className="border-zinc-200 bg-white shadow-sm"
        >
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">
                {t('subscriptions.lastReceiptTitle')}
              </CardTitle>
              <CardDescription>
                {lastReceipt.customer.phone} · {lastReceipt.plan.name}
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => window.print()}
            >
              {t('subscriptions.printInvoice')}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 space-y-2 tabular-nums">
              <p className="font-medium text-zinc-900">
                {t('subscriptions.invoiceTitle')}
              </p>
              <div className="flex justify-between gap-4 border-b border-zinc-200 pb-2">
                <span className="text-zinc-600">
                  {t('subscriptions.invoiceTotalReceived')}
                </span>
                <span>{formatKwdLabel(s.totalCollected)}</span>
              </div>
              <div className="flex justify-between gap-4 border-b border-zinc-200 pb-2">
                <span className="text-zinc-600">
                  {t('subscriptions.invoiceDebtSettled')}
                </span>
                <span>- {formatKwdLabel(s.debtSettled)}</span>
              </div>
              <div className="flex justify-between gap-4 border-b border-zinc-200 pb-2 font-medium">
                <span className="text-zinc-800">
                  {t('subscriptions.invoiceNetAfterDebt')}
                </span>
                <span>= {formatKwdLabel(netAfterDebt)}</span>
              </div>
              <div className="flex justify-between gap-4 border-b border-zinc-200 pb-2">
                <span className="text-zinc-600">
                  {t('subscriptions.invoiceAddedToBalance')}
                </span>
                <span>{formatKwdLabel(s.creditedToBalance)}</span>
              </div>
              <div className="flex justify-between gap-4 pt-1">
                <span className="text-zinc-600">
                  {t('subscriptions.invoiceClosingBalance')}
                </span>
                <span className="font-semibold text-zinc-900">
                  {formatKwdLabel(s.newBalance)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-zinc-600">
                  {t('subscriptions.invoiceClosingDebt')}
                </span>
                <span className="font-semibold text-zinc-900">
                  {formatKwdLabel(s.newDebt)}
                </span>
              </div>
            </div>
            <p className="text-xs text-zinc-500">
              {t('subscriptions.invoiceEquationNote')}
            </p>
          </CardContent>
        </Card>
      : null}
    </div>
  );
}

