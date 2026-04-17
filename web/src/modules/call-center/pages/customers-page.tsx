import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { CreditCard, Loader2, MessageCircle, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { type CustomerDirectoryRow, ApiError, apiJson } from '@/lib/api';
import { customerDirectoryBalanceWhatsAppHref } from '@/modules/shared/lib/whatsapp-links';
import { useCustomersDataBridge } from '@/modules/shared/hooks/use-customers-data-bridge';
import { Button } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import { cn } from '@/lib/utils';

type EditDraft = {
  displayName: string;
  phone: string;
  phone2: string;
  addressArea: string;
  addressBlock: string;
  addressStreet: string;
  addressAvenue: string;
  addressHouse: string;
  motherContact: string;
  wifeContact: string;
  sonContact: string;
};

function toDraft(row: CustomerDirectoryRow['customer']): EditDraft {
  return {
    displayName: row.displayName ?? '',
    phone: row.phone ?? '',
    phone2: row.phone2 ?? '',
    addressArea: row.addressArea ?? '',
    addressBlock: row.addressBlock ?? '',
    addressStreet: row.addressStreet ?? '',
    addressAvenue: row.addressAvenue ?? '',
    addressHouse: row.addressHouse ?? '',
    motherContact: row.motherContact ?? '',
    wifeContact: row.wifeContact ?? '',
    sonContact: row.sonContact ?? '',
  };
}

export function CustomersPage() {
  const { t } = useTranslation();
  const { token, hasRole } = useAuth();
  const allowed = hasRole('OWNER', 'ACCOUNTANT');
  const canWhatsAppBalance = allowed;
  const { q, setQ, rows, loading, error, reload } = useCustomersDataBridge({
    token,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const activeRow = useMemo(
    () => rows.find((r) => r.customer.id === activeId) ?? null,
    [rows, activeId],
  );

  useEffect(() => {
    if (!activeRow) return;
    setDraft(toDraft(activeRow.customer));
  }, [activeRow]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  async function save() {
    if (!token || !activeId || !draft) return;
    setSaving(true);
    try {
      await apiJson(`/api/customers/${activeId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(draft),
      });
      toast.success(t('customers.saved'));
      await reload();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('customers.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('customers.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder={t('customers.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full min-w-0 sm:w-64"
          />
          <Button type="button" variant="outline" onClick={() => void reload()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t('customers.listTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.map((r) => {
              const balance = Number.parseFloat(r.subscription.walletBalance ?? '0');
              const isLow = Number.isFinite(balance) && balance < 10;
              const wa = customerDirectoryBalanceWhatsAppHref(r);
              const payHref = r.debt.totalDebt !== '0.0000' ? '/collections' : null;
              return (
                <button
                  key={r.customer.id}
                  type="button"
                  onClick={() => setActiveId(r.customer.id)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-start transition',
                    activeId === r.customer.id && 'border-primary bg-primary/5',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{r.customer.displayName || r.customer.phone}</p>
                    <span className="flex shrink-0 items-center gap-2">
                      {wa && canWhatsAppBalance ?
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t('customers.whatsappBalance')}
                          className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md text-primary hover:bg-primary/10"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MessageCircle className="h-5 w-5" aria-hidden />
                        </a>
                      : null}
                      {payHref ?
                        <a
                          href={payHref}
                          title={t('customers.paymentLink')}
                          className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md text-primary hover:bg-primary/10"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <CreditCard className="h-5 w-5" aria-hidden />
                        </a>
                      : null}
                      <p className={cn('text-sm tabular-nums', isLow && 'font-semibold text-red-700')}>
                        {r.subscription.walletBalance} KWD
                      </p>
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.customer.phone}
                    {r.customer.phone2 ? ` · ${r.customer.phone2}` : ''}
                  </p>
                  {isLow ? <p className="mt-1 text-xs font-semibold text-red-700">{t('customers.lowBalance')}</p> : null}
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('customers.editTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!draft ? (
              <p className="text-sm text-muted-foreground">{t('customers.selectHint')}</p>
            ) : (
              <>
                <div className="space-y-1"><Label>{t('customers.name')}</Label><Input value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label>{t('customers.phone')}</Label><Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></div>
                  <div className="space-y-1"><Label>{t('customers.phone2')}</Label><Input value={draft.phone2} onChange={(e) => setDraft({ ...draft, phone2: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label>{t('customers.addressArea')}</Label><Input value={draft.addressArea} onChange={(e) => setDraft({ ...draft, addressArea: e.target.value })} /></div>
                  <div className="space-y-1"><Label>{t('customers.addressBlock')}</Label><Input value={draft.addressBlock} onChange={(e) => setDraft({ ...draft, addressBlock: e.target.value })} /></div>
                </div>
                <div className="space-y-1"><Label>{t('customers.addressStreet')}</Label><Input value={draft.addressStreet} onChange={(e) => setDraft({ ...draft, addressStreet: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label>{t('customers.addressAvenue')}</Label><Input value={draft.addressAvenue} onChange={(e) => setDraft({ ...draft, addressAvenue: e.target.value })} /></div>
                  <div className="space-y-1"><Label>{t('customers.addressHouse')}</Label><Input value={draft.addressHouse} onChange={(e) => setDraft({ ...draft, addressHouse: e.target.value })} /></div>
                </div>
                <div className="space-y-1"><Label>{t('customers.motherContact')}</Label><Input value={draft.motherContact} onChange={(e) => setDraft({ ...draft, motherContact: e.target.value })} /></div>
                <div className="space-y-1"><Label>{t('customers.wifeContact')}</Label><Input value={draft.wifeContact} onChange={(e) => setDraft({ ...draft, wifeContact: e.target.value })} /></div>
                <div className="space-y-1"><Label>{t('customers.sonContact')}</Label><Input value={draft.sonContact} onChange={(e) => setDraft({ ...draft, sonContact: e.target.value })} /></div>
                <Button type="button" onClick={() => void save()} disabled={saving}>
                  {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Save className="me-2 h-4 w-4" />}
                  {t('customers.save')}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
