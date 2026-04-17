import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type DriverBalanceResponse,
  apiJson,
  ApiError,
  confirmHandover,
  uploadHandoverReceipt,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { Button } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { Label } from '@/modules/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';

export function CollectDriverCashPage() {
  const { t } = useTranslation();
  const { token, hasRole } = useAuth();
  const [drivers, setDrivers] = useState<DriverBalanceResponse | null>(null);
  const [driverId, setDriverId] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const canUse = hasRole('OWNER', 'MANAGER', 'ACCOUNTANT') ?? false;
  const canSubmit = hasRole('MANAGER') ?? false;

  const loadDrivers = useCallback(async () => {
    if (!token || !canUse) return;
    setLoading(true);
    try {
      const d = await apiJson<DriverBalanceResponse>(
        '/api/finance/driver-balance',
        { token },
      );
      setDrivers(d);
      setDriverId((prev) => {
        if (prev && d.drivers.some((x) => x.driverId === prev)) return prev;
        return d.drivers[0]?.driverId ?? '';
      });
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, canUse]);

  useEffect(() => {
    void loadDrivers();
  }, [loadDrivers]);

  useEffect(() => {
    if (!receiptFile) {
      setPreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(receiptFile);
    setPreviewUrl(u);
    return () => {
      URL.revokeObjectURL(u);
    };
  }, [receiptFile]);

  const selected = useMemo(
    () => drivers?.drivers.find((d) => d.driverId === driverId),
    [drivers, driverId],
  );

  const onSubmit = async () => {
    if (!token) return;
    if (!driverId) {
      toast.error(t('collectDriverCash.needDriver'));
      return;
    }
    if (!receiptFile) {
      toast.error(t('collectDriverCash.needFile'));
      return;
    }
    setSubmitting(true);
    try {
      const { depositReceiptUrl } = await uploadHandoverReceipt(
        token,
        receiptFile,
      );
      await confirmHandover(token, { driverId, depositReceiptUrl });
      toast.success(t('collectDriverCash.success'));
      setReceiptFile(null);
      await loadDrivers();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!canUse) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {t('collectDriverCash.title')}
        </h1>
        <p className="text-sm text-zinc-500">{t('collectDriverCash.subtitle')}</p>
      </header>

      <Card className="border-zinc-200 bg-white">
        <CardHeader>
          <CardTitle className="text-base">{t('collectDriverCash.selectDriver')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading || !drivers ?
            <p className="text-sm text-muted-foreground">...</p>
          : <>
              <div className="space-y-2">
                <Label>{t('collectDriverCash.selectDriver')}</Label>
                               <Select
                  value={driverId}
                  onValueChange={(v) => {
                    if (v) setDriverId(v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('collectDriverCash.selectDriver')}>
                      {selected ?
                        `${selected.fullName} (@${selected.username})`
                      : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.drivers.map((d) => (
                      <SelectItem key={d.driverId} value={d.driverId}>
                        {d.fullName} (@{d.username})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selected ?
                <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 p-4 text-sm">
                  <p className="font-medium text-zinc-800">
                    {t('collectDriverCash.balanceLabel')}
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-zinc-900">
                    {formatKwdLabel(selected.heldCashTotal)}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {t('collectDriverCash.ordersPending')}:{' '}
                    <span className="tabular-nums font-medium text-foreground">
                      {selected.pendingSettlementOrderCount}
                    </span>
                  </p>
                </div>
              : null}

              {canSubmit ?
                <>
                  <div className="space-y-2">
                    <Label htmlFor="deposit-receipt">
                      {t('collectDriverCash.receiptLabel')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('collectDriverCash.receiptHint')}
                    </p>
                    <input
                      id="deposit-receipt"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="block w-full text-sm text-zinc-600 file:me-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        setReceiptFile(f);
                      }}
                    />
                  </div>

                  {previewUrl ?
                    <div className="overflow-hidden rounded-lg border border-zinc-200">
                      <img
                        src={previewUrl}
                        alt={t('collectDriverCash.previewAlt')}
                        className="max-h-64 w-full object-contain bg-zinc-100"
                      />
                    </div>
                  : null}

                  <Button
                    type="button"
                    className="w-full"
                    disabled={
                      submitting || !driverId || !receiptFile || !selected
                    }
                    onClick={() => void onSubmit()}
                  >
                    {submitting ?
                      <>
                        <Loader2 className="me-2 h-4 w-4 animate-spin" />
                        {t('collectDriverCash.submitting')}
                      </>
                    : t('collectDriverCash.submit')}
                  </Button>
                </>
              : <p className="text-xs text-muted-foreground">{t('collectDriverCash.readOnlyHint')}</p>}
            </>
          }
        </CardContent>
      </Card>
    </div>
  );
}

