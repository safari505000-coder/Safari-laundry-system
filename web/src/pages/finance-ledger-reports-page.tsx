/**
 * FinanceLedgerReportsPage — Stage A double-entry projection UI.
 *
 * Renders six tabs over `/api/finance/ledger/*`:
 *
 *   1. Overview        — globals + per-account balances (summary)
 *   2. Drivers         — DRIVER_* accounts (filtered from summary)
 *   3. Branch          — MANAGER_* accounts (filtered from summary)
 *   4. Company         — COMPANY_CASH + BANK_ACCOUNT + REVENUE_POS + EXPENSE_*
 *   5. Transactions    — flat entry stream
 *   6. Reconciliation  — Σdebit == Σcredit invariant report
 *
 * STRICT SSoT: every KD figure on this page comes from the server.
 * The page never sums, never aggregates, never parses currency
 * strings — ESLint enforces this at the syntax level (the
 * `no-restricted-syntax` rule on `parseFloat(...Kd)` and
 * `totalCashInFlight` in `eslint.config.js`).
 *
 * RBAC: client gate is `financeLedgerReports.view`; the server
 * re-asserts OWNER / GENERAL_MANAGER / ACCOUNTANT on every endpoint.
 */
import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  getLedgerSummary,
  getLedgerTransactions,
  getLedgerReconciliation,
  type LedgerSummaryResponse,
  type LedgerTransactionsResponse,
  type LedgerReconciliationResponse,
  ApiError,
} from '@/lib/api';
import { PageHeader } from '@/modules/shared/components/page';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/modules/shared/components/ui/tabs';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
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

function startOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x.toISOString();
}

function endOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x.toISOString();
}

function defaultFromIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 30);
  return startOfDayIso(d);
}

type AccountFilter = 'ALL' | 'DRIVER' | 'MANAGER' | 'COMPANY';

function filterAccounts(
  accounts: LedgerSummaryResponse['accounts'],
  kind: AccountFilter,
): LedgerSummaryResponse['accounts'] {
  if (kind === 'ALL') return accounts;
  if (kind === 'DRIVER') {
    return accounts.filter((a) => a.accountId.startsWith('DRIVER_'));
  }
  if (kind === 'MANAGER') {
    return accounts.filter((a) => a.accountId.startsWith('MANAGER_'));
  }
  // COMPANY = company cash + bank + revenue + every expense bucket
  return accounts.filter(
    (a) =>
      a.accountId === 'COMPANY_CASH' ||
      a.accountId === 'BANK_ACCOUNT' ||
      a.accountId === 'REVENUE_POS' ||
      a.accountId.startsWith('EXPENSE_'),
  );
}

function AccountsTable({
  rows,
}: {
  rows: LedgerSummaryResponse['accounts'];
}) {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('financeLedger.noAccounts', { defaultValue: 'No accounts in range' })}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('financeLedger.col.account', { defaultValue: 'Account' })}</TableHead>
            <TableHead className="text-right">{t('financeLedger.col.debit', { defaultValue: 'Debit (KD)' })}</TableHead>
            <TableHead className="text-right">{t('financeLedger.col.credit', { defaultValue: 'Credit (KD)' })}</TableHead>
            <TableHead className="text-right">{t('financeLedger.col.balance', { defaultValue: 'Balance (KD)' })}</TableHead>
            <TableHead className="text-right">{t('financeLedger.col.entries', { defaultValue: 'Entries' })}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.accountId}>
              <TableCell className="font-mono text-xs">{r.accountId}</TableCell>
              <TableCell className="text-right tabular-nums">{r.totalDebit}</TableCell>
              <TableCell className="text-right tabular-nums">{r.totalCredit}</TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {r.balance}
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.entryCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function OverviewTab({ summary }: { summary: LedgerSummaryResponse | null }) {
  const { t } = useTranslation();
  if (!summary) return null;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t('financeLedger.kpi.entries', { defaultValue: 'Entries' })}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {summary.totalEntries}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t('financeLedger.kpi.transactions', { defaultValue: 'Transactions' })}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {summary.totalTransactions}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t('financeLedger.kpi.debit', { defaultValue: 'Σ Debit (KD)' })}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {summary.globalDebit}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t('financeLedger.kpi.credit', { defaultValue: 'Σ Credit (KD)' })}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {summary.globalCredit}
          </CardContent>
        </Card>
      </div>
      <AccountsTable rows={summary.accounts} />
    </div>
  );
}

function TransactionsTab({
  txs,
}: {
  txs: LedgerTransactionsResponse | null;
}) {
  const { t } = useTranslation();
  if (!txs) return null;
  if (txs.entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('financeLedger.noEntries', { defaultValue: 'No entries in range' })}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('financeLedger.col.txId', { defaultValue: 'Tx Id' })}</TableHead>
            <TableHead>{t('financeLedger.col.account', { defaultValue: 'Account' })}</TableHead>
            <TableHead className="text-right">{t('financeLedger.col.debit', { defaultValue: 'Debit (KD)' })}</TableHead>
            <TableHead className="text-right">{t('financeLedger.col.credit', { defaultValue: 'Credit (KD)' })}</TableHead>
            <TableHead>{t('financeLedger.col.at', { defaultValue: 'At' })}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {txs.entries.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="font-mono text-xs">{e.txId}</TableCell>
              <TableCell className="font-mono text-xs">{e.accountId}</TableCell>
              <TableCell className="text-right tabular-nums">{e.debit}</TableCell>
              <TableCell className="text-right tabular-nums">{e.credit}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(e.createdAt).toISOString().slice(0, 19).replace('T', ' ')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ReconciliationTab({
  recon,
}: {
  recon: LedgerReconciliationResponse | null;
}) {
  const { t } = useTranslation();
  if (!recon) return null;
  const passing = recon.status === 'PASS';
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          {passing ? (
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-rose-600" />
          )}
          <CardTitle className="text-base">
            {passing
              ? t('financeLedger.recon.pass', {
                  defaultValue: 'Ledger invariant PASS — Σdebit == Σcredit',
                })
              : t('financeLedger.recon.fail', {
                  defaultValue: 'Ledger invariant FAIL — drift detected',
                })}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Σ Debit:</span>{' '}
            <span className="font-mono tabular-nums">{recon.globalDebit}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Σ Credit:</span>{' '}
            <span className="font-mono tabular-nums">{recon.globalCredit}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Transactions:</span>{' '}
            <span className="tabular-nums">{recon.totalTransactions}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Entries:</span>{' '}
            <span className="tabular-nums">{recon.totalEntries}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Unattributed entries:</span>{' '}
            <span className="tabular-nums">{recon.unattributedEntries}</span>
          </div>
        </CardContent>
      </Card>
      {recon.unbalancedTransactions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-rose-700">
              {t('financeLedger.recon.unbalancedTitle', {
                defaultValue: 'Unbalanced transactions',
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tx Id</TableHead>
                    <TableHead className="text-right">Debit (KD)</TableHead>
                    <TableHead className="text-right">Credit (KD)</TableHead>
                    <TableHead className="text-right">Δ (KD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recon.unbalancedTransactions.map((u) => (
                    <TableRow key={u.txId}>
                      <TableCell className="font-mono text-xs">{u.txId}</TableCell>
                      <TableCell className="text-right tabular-nums">{u.debit}</TableCell>
                      <TableCell className="text-right tabular-nums">{u.credit}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {u.delta}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export function FinanceLedgerReportsPage() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const allowed = can(user, 'financeLedgerReports.view');
  const [from, setFrom] = useState(() => defaultFromIso());
  const [to, setTo] = useState(() => endOfDayIso(new Date()));
  const [activeTab, setActiveTab] = useState<
    'overview' | 'drivers' | 'branch' | 'company' | 'transactions' | 'reconciliation'
  >('overview');
  const [summary, setSummary] = useState<LedgerSummaryResponse | null>(null);
  const [txs, setTxs] = useState<LedgerTransactionsResponse | null>(null);
  const [recon, setRecon] = useState<LedgerReconciliationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !allowed) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      Promise.all([
        getLedgerSummary(token, { from, to }),
        getLedgerTransactions(token, { from, to, take: 500 }),
        getLedgerReconciliation(token, { from, to }),
      ])
        .then(([s, x, r]) => {
          if (cancelled) return;
          setSummary(s);
          setTxs(x);
          setRecon(r);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setError(e instanceof ApiError ? e.message : 'Failed to load ledger');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [token, allowed, from, to]);

  const driversAccounts = useMemo(
    () => filterAccounts(summary?.accounts ?? [], 'DRIVER'),
    [summary],
  );
  const branchAccounts = useMemo(
    () => filterAccounts(summary?.accounts ?? [], 'MANAGER'),
    [summary],
  );
  const companyAccounts = useMemo(
    () => filterAccounts(summary?.accounts ?? [], 'COMPANY'),
    [summary],
  );

  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-1 pb-8">
      <PageHeader
        title={t('financeLedger.title', { defaultValue: 'Strict Ledger Reports' })}
        subtitle={t('financeLedger.subtitle', {
          defaultValue:
            'Double-entry projection over the canonical cash sources. Every figure is server-calculated; the client never sums.',
        })}
        tone="blue"
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t('reports.filters', { defaultValue: 'Filters' })}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="ledger-from">
              {t('reports.from', { defaultValue: 'From' })}
            </Label>
            <Input
              id="ledger-from"
              type="datetime-local"
              value={from.slice(0, 16)}
              onChange={(e) => setFrom(new Date(e.target.value).toISOString())}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ledger-to">
              {t('reports.to', { defaultValue: 'To' })}
            </Label>
            <Input
              id="ledger-to"
              type="datetime-local"
              value={to.slice(0, 16)}
              onChange={(e) => setTo(new Date(e.target.value).toISOString())}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              className="gap-1.5"
              disabled={loading}
              onClick={() => {
                // Touch state to trigger the effect again with a new timestamp.
                setTo((cur) => cur);
              }}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {t('reports.refresh', { defaultValue: 'Refresh' })}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-rose-300 bg-rose-50">
          <CardContent className="py-3 text-sm text-rose-800">{error}</CardContent>
        </Card>
      ) : null}

      <Tabs
        value={activeTab}
        onValueChange={(v) =>
          setActiveTab(
            v as
              | 'overview'
              | 'drivers'
              | 'branch'
              | 'company'
              | 'transactions'
              | 'reconciliation',
          )
        }
      >
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6">
          <TabsTrigger value="overview">
            {t('financeLedger.tab.overview', { defaultValue: 'Overview' })}
          </TabsTrigger>
          <TabsTrigger value="drivers">
            {t('financeLedger.tab.drivers', { defaultValue: 'Drivers' })}
          </TabsTrigger>
          <TabsTrigger value="branch">
            {t('financeLedger.tab.branch', { defaultValue: 'Branch' })}
          </TabsTrigger>
          <TabsTrigger value="company">
            {t('financeLedger.tab.company', { defaultValue: 'Company' })}
          </TabsTrigger>
          <TabsTrigger value="transactions">
            {t('financeLedger.tab.transactions', { defaultValue: 'Transactions' })}
          </TabsTrigger>
          <TabsTrigger value="reconciliation">
            {t('financeLedger.tab.reconciliation', { defaultValue: 'Reconciliation' })}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-4">
          <OverviewTab summary={summary} />
        </TabsContent>
        <TabsContent value="drivers" className="pt-4">
          <AccountsTable rows={driversAccounts} />
        </TabsContent>
        <TabsContent value="branch" className="pt-4">
          <AccountsTable rows={branchAccounts} />
        </TabsContent>
        <TabsContent value="company" className="pt-4">
          <AccountsTable rows={companyAccounts} />
        </TabsContent>
        <TabsContent value="transactions" className="pt-4">
          <TransactionsTab txs={txs} />
        </TabsContent>
        <TabsContent value="reconciliation" className="pt-4">
          <ReconciliationTab recon={recon} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default FinanceLedgerReportsPage;
