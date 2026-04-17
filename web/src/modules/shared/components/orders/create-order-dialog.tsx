import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type LaundryPriceListItemRow,
  type LaundryPriceTier,
  apiJson,
  ApiError,
} from '@/lib/api';
import {
  buildLaundryPriceListPath,
  useLaundryPricingBranchId,
} from '@/modules/shared/hooks/use-price-list';
import { Button } from '@/modules/shared/components/ui/button';
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

type LineState = {
  key: string;
  itemId: string;
  tier: LaundryPriceTier | '';
  quantity: number;
  unitPrice: string;
  priceReadOnly: boolean;
};

function tiersForItem(item: LaundryPriceListItemRow): LaundryPriceTier[] {
  const t: LaundryPriceTier[] = ['NORMAL', 'URGENT'];
  if (item.pricePressOnly != null) t.push('PRESS_ONLY');
  if (item.priceUrgentPress != null) t.push('URGENT_PRESS');
  return t;
}

function priceForTier(
  item: LaundryPriceListItemRow,
  tier: LaundryPriceTier,
): number {
  switch (tier) {
    case 'NORMAL':
      return Number.parseFloat(item.priceNormal);
    case 'URGENT':
      return Number.parseFloat(item.priceUrgent);
    case 'PRESS_ONLY':
      return item.pricePressOnly != null ?
          Number.parseFloat(item.pricePressOnly)
        : 0;
    case 'URGENT_PRESS':
      return item.priceUrgentPress != null ?
          Number.parseFloat(item.priceUrgentPress)
        : 0;
    default:
      return 0;
  }
}

function emptyLine(): LineState {
  return {
    key: crypto.randomUUID(),
    itemId: '',
    tier: '',
    quantity: 1,
    unitPrice: '',
    priceReadOnly: false,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

export function CreateOrderDialog({ open, onOpenChange, onCreated }: Props) {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const pricingBranchId = useLaundryPricingBranchId();
  const [catalog, setCatalog] = useState<LaundryPriceListItemRow[] | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [serviceType, setServiceType] = useState<'NORMAL' | 'EXPRESS'>(
    'NORMAL',
  );
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);

  const isDriver = user?.safariRole === 'DRIVER';

  const loadCatalog = useCallback(async () => {
    if (!token) return;
    setLoadingCatalog(true);
    try {
      const path = buildLaundryPriceListPath(pricingBranchId);
      const data = await apiJson<LaundryPriceListItemRow[]>(path, {
        token,
      });
      setCatalog(data);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoadingCatalog(false);
    }
  }, [token, pricingBranchId]);

  useEffect(() => {
    if (open && token) void loadCatalog();
  }, [open, token, loadCatalog]);

  const itemsById = useMemo(() => {
    const m = new Map<string, LaundryPriceListItemRow>();
    for (const it of catalog ?? []) m.set(it.id, it);
    return m;
  }, [catalog]);

  function syncLineFromItemTier(line: LineState): LineState {
    if (!line.itemId || !line.tier) {
      return {
        ...line,
        unitPrice: '',
        priceReadOnly: false,
      };
    }
    const item = itemsById.get(line.itemId);
    if (!item) return line;
    const p = priceForTier(item, line.tier as LaundryPriceTier);
    const manual = item.manualEntry || p <= 0;
    return {
      ...line,
      unitPrice: manual ? line.unitPrice : p.toFixed(4),
      priceReadOnly: !manual,
    };
  }

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        if ('itemId' in patch || 'tier' in patch) {
          return syncLineFromItemTier(next);
        }
        return next;
      }),
    );
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) =>
      prev.length <= 1 ? prev : prev.filter((r) => r.key !== key),
    );
  }

  const orderTotal = useMemo(() => {
    let sum = 0;
    for (const row of lines) {
      const q = row.quantity;
      const u = Number.parseFloat(row.unitPrice);
      if (!Number.isFinite(q) || !Number.isFinite(u)) continue;
      sum += q * u;
    }
    return sum;
  }, [lines]);

  function resetForm() {
    setPhone('');
    setAddress('');
    setServiceType('NORMAL');
    setLines([emptyLine()]);
  }

  async function submit() {
    if (!token) {
      toast.error(t('orders.create.noSession'));
      return;
    }
    const normalizedPhone = phone.replace(/[\s-]/g, '').trim();
    if (normalizedPhone.length < 8) {
      toast.error(t('orders.create.phoneInvalid'));
      return;
    }
    for (const row of lines) {
      if (!row.itemId || !row.tier) {
        toast.error(t('orders.create.lineIncomplete'));
        return;
      }
      if (!Number.isFinite(row.quantity) || row.quantity <= 0) {
        toast.error(t('orders.create.quantityInvalid'));
        return;
      }
      const u = Number.parseFloat(row.unitPrice);
      if (!Number.isFinite(u) || u <= 0) {
        toast.error(t('orders.create.priceRequired'));
        return;
      }
    }
    if (orderTotal <= 0) {
      toast.error(t('orders.create.totalInvalid'));
      return;
    }

    const linePayload = lines.map((row) => {
      const item = itemsById.get(row.itemId)!;
      const tierKey = row.tier as LaundryPriceTier;
      const tierLabel = t(`orders.tier.${tierKey}`);
      return {
        label: `${item.nameAr} — ${tierLabel}`,
        quantity: row.quantity,
        unitPrice: Number.parseFloat(row.unitPrice),
      };
    });

    const body = {
      customerPhone: normalizedPhone,
      customerAddress: address.trim() || undefined,
      serviceType,
      totalPrice: orderTotal,
      lineItems: linePayload,
    };

    const path = isDriver ? '/api/orders/quick' : '/api/orders';

    setSaving(true);
    try {
      await apiJson<unknown>(path, {
        method: 'POST',
        token,
        body: JSON.stringify(body),
      });
      toast.success(t('orders.create.success'));
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('orders.create.title')}</DialogTitle>
        </DialogHeader>

        {loadingCatalog || !catalog ?
          <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t('orders.create.loadingPrices')}
          </div>
        : <>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="co-phone">{t('orders.create.phone')}</Label>
                <Input
                  id="co-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('orders.create.phonePlaceholder')}
                  className="bg-white"
                  autoComplete="tel"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="co-addr">{t('orders.create.address')}</Label>
                <Input
                  id="co-addr"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('orders.create.serviceType')}</Label>
                <Select
                  value={serviceType}
                  onValueChange={(v) =>
                    setServiceType(v as 'NORMAL' | 'EXPRESS')
                  }
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NORMAL">
                      {t('orders.create.serviceNormal')}
                    </SelectItem>
                    <SelectItem value="EXPRESS">
                      {t('orders.create.serviceExpress')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base">{t('orders.create.lines')}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={addLine}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  {t('orders.create.addLine')}
                </Button>
              </div>

              {lines.map((row) => {
                const item = row.itemId ? itemsById.get(row.itemId) : undefined;
                const tierOptions = item ? tiersForItem(item) : [];
                return (
                  <div
                    key={row.key}
                    className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3"
                  >
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-zinc-500"
                        onClick={() => removeLine(row.key)}
                        disabled={lines.length <= 1}
                        aria-label={t('orders.create.removeLine')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">{t('orders.create.item')}</Label>
                        <Select
                          value={row.itemId || undefined}
                          onValueChange={(v) =>
                            updateLine(row.key, {
                              itemId: v ?? '',
                              tier: '',
                              unitPrice: '',
                              priceReadOnly: false,
                            })
                          }
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue
                              placeholder={
                                t('orders.create.pickItem') ?? undefined
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {catalog.map((it) => (
                              <SelectItem key={it.id} value={it.id}>
                                {it.nameAr}
                                {it.nameEn ? ` آ· ${it.nameEn}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t('orders.create.tier')}</Label>
                        <Select
                          value={row.tier || undefined}
                          disabled={!row.itemId}
                          onValueChange={(v) =>
                            updateLine(row.key, {
                              tier: (v ?? '') as LaundryPriceTier | '',
                            })
                          }
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue
                              placeholder={
                                t('orders.create.pickTier') ?? undefined
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {tierOptions.map((tier) => (
                              <SelectItem key={tier} value={tier}>
                                {t(`orders.tier.${tier}`, {
                                  defaultValue: tier,
                                })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {t('orders.create.quantity')}
                        </Label>
                        <Input
                          type="number"
                          min={0.0001}
                          step="any"
                          className="bg-white"
                          value={row.quantity}
                          onChange={(e) =>
                            updateLine(row.key, {
                              quantity: Number.parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">
                          {t('orders.create.unitPrice')}
                          {row.priceReadOnly ?
                            <span className="ms-1 font-normal text-zinc-400">
                              ({t('orders.create.fromList')})
                            </span>
                          : null}
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.0001"
                          className="bg-white tabular-nums"
                          disabled={row.priceReadOnly}
                          value={row.unitPrice}
                          onChange={(e) =>
                            updateLine(row.key, {
                              unitPrice: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-2 text-sm font-medium tabular-nums text-zinc-800">
              {t('orders.create.total')}{' '}
              {orderTotal.toLocaleString(undefined, {
                minimumFractionDigits: 3,
                maximumFractionDigits: 4,
              })}{' '}
              KWD
            </p>
          </>
        }

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t('orders.create.cancel')}
          </Button>
          <Button
            type="button"
            className="bg-zinc-900 text-white hover:bg-zinc-800"
            disabled={
              saving || loadingCatalog || !catalog || catalog.length === 0
            }
            onClick={() => void submit()}
          >
            {saving ?
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />
                {t('orders.create.saving')}
              </>
            : t('orders.create.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

