import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { Loader2, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { type CustomerSearchRow, ApiError, apiJson } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

function toDraft(row: CustomerSearchRow): EditDraft {
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
  const allowed = hasRole(
    'OWNER',
    'MANAGER',
    'CALL_CENTER',
    'SUPERVISOR',
    'ACCOUNTANT',
    'VIEWER',
  );
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<CustomerSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const query = q.trim();
      const data = await apiJson<CustomerSearchRow[]>(
        `/api/customers${query.length >= 2 ? `?q=${encodeURIComponent(query)}` : ''}`,
        { token },
      );
      setRows(data ?? []);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, q]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const activeRow = useMemo(
    () => rows.find((r) => r.id === activeId) ?? null,
    [rows, activeId],
  );

  useEffect(() => {
    if (!activeRow) return;
    setDraft(toDraft(activeRow));
  }, [activeRow]);

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
      await fetchRows();
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
            className="w-64"
          />
          <Button type="button" variant="outline" onClick={() => void fetchRows()}>
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
              const balance = Number.parseFloat(r.wallet?.balance ?? '0');
              const isLow = Number.isFinite(balance) && balance < 10;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setActiveId(r.id)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-start transition',
                    activeId === r.id && 'border-primary bg-primary/5',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{r.displayName || r.phone}</p>
                    <p className={cn('text-sm tabular-nums', isLow && 'font-semibold text-red-700')}>
                      {(r.wallet?.balance ?? '0.0000')} KWD
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.phone}{r.phone2 ? ` · ${r.phone2}` : ''}</p>
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
