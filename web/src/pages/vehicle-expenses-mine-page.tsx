import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Car, Loader2, Plus, Receipt } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  ApiError,
  createVehicleExpense,
  listVehicleExpenses,
  type VehicleExpenseRow,
  type VehicleExpenseType,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import { Textarea } from '@/modules/shared/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';

const EXPENSE_TYPES: VehicleExpenseType[] = [
  'FUEL',
  'OIL_CHANGE',
  'TIRES',
  'MECHANICAL_REPAIR',
  'ELECTRICAL_REPAIR',
  'BODY_REPAIR',
  'AC_REPAIR',
  'WASHING',
  'REGISTRATION',
  'INSURANCE',
  'SPARE_PARTS',
  'OTHER',
];

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function statusChipClass(status: VehicleExpenseRow['status']): string {
  switch (status) {
    case 'APPROVED':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'REJECTED':
      return 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
    case 'PENDING_ACCOUNTANT':
    default:
      return 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
  }
}

export function VehicleExpensesMinePage() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const dateLocale = useAppLocale();
  const canSubmit = can(user, 'vehicleExpenses.submit');
  const canViewMine = can(user, 'vehicleExpenses.mine');

  const [rows, setRows] = useState<VehicleExpenseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleLabel, setVehicleLabel] = useState('');
  const [expenseType, setExpenseType] = useState<VehicleExpenseType>('FUEL');
  const [amount, setAmount] = useState('');
  const [odometer, setOdometer] = useState('');
  const [vendor, setVendor] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState<string>(todayIsoDate());
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !canViewMine) return;
    setLoading(true);
    try {
      const data = await listVehicleExpenses(token);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error(t('vehicleExpenses.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [token, canViewMine, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime(),
      ),
    [rows],
  );

  function onReceipt(f: File | null) {
    if (!f) {
      setReceiptPreview(null);
      return;
    }
    if (f.size > 900_000) {
      toast.error(t('vehicleExpenses.fileTooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === 'string') setReceiptPreview(r);
    };
    reader.readAsDataURL(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !canSubmit) return;
    const amt = Number.parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error(t('vehicleExpenses.invalidAmount'));
      return;
    }
    if (!receiptPreview) {
      toast.error(t('vehicleExpenses.receiptRequired'));
      return;
    }
    if (!vehiclePlate.trim()) {
      toast.error(t('vehicleExpenses.fieldVehiclePlate'));
      return;
    }
    setSaving(true);
    try {
      await createVehicleExpense(token, {
        vehiclePlate: vehiclePlate.trim(),
        ...(vehicleLabel.trim() ? { vehicleLabel: vehicleLabel.trim() } : {}),
        expenseType,
        amount: amt,
        ...(odometer.trim()
          ? { odometerKm: Number.parseInt(odometer, 10) }
          : {}),
        ...(vendor.trim() ? { vendorName: vendor.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(expenseDate
          ? { expenseDate: new Date(expenseDate).toISOString() }
          : {}),
        receiptUrl: receiptPreview,
      });
      toast.success(t('vehicleExpenses.saved'));
      setVehiclePlate('');
      setVehicleLabel('');
      setAmount('');
      setOdometer('');
      setVendor('');
      setDescription('');
      setExpenseDate(todayIsoDate());
      setReceiptPreview(null);
      void load();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!canViewMine && !canSubmit) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Car className="h-6 w-6 text-primary" />
          {t('vehicleExpenses.pageTitle')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('vehicleExpenses.pageSubtitle')}
        </p>
      </header>

      {canSubmit ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4" />
              {t('vehicleExpenses.newExpense')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => void submit(e)}
              className="grid grid-cols-1 gap-4 md:grid-cols-2"
            >
              <div className="space-y-1.5">
                <Label htmlFor="plate">
                  {t('vehicleExpenses.fieldVehiclePlate')}
                </Label>
                <Input
                  id="plate"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="label">
                  {t('vehicleExpenses.fieldVehicleLabel')}
                </Label>
                <Input
                  id="label"
                  value={vehicleLabel}
                  onChange={(e) => setVehicleLabel(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="type">
                  {t('vehicleExpenses.fieldExpenseType')}
                </Label>
                <Select
                  value={expenseType}
                  onValueChange={(v) => setExpenseType(v as VehicleExpenseType)}
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_TYPES.map((et) => (
                      <SelectItem key={et} value={et}>
                        {t(`vehicleExpenses.typeLabel.${et}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amount">
                  {t('vehicleExpenses.fieldAmount')}
                </Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.001"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="odometer">
                  {t('vehicleExpenses.fieldOdometer')}
                </Label>
                <Input
                  id="odometer"
                  type="number"
                  min="0"
                  value={odometer}
                  onChange={(e) => setOdometer(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vendor">
                  {t('vehicleExpenses.fieldVendor')}
                </Label>
                <Input
                  id="vendor"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expenseDate">
                  {t('vehicleExpenses.fieldExpenseDate')}
                </Label>
                <Input
                  id="expenseDate"
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="description">
                  {t('vehicleExpenses.fieldDescription')}
                </Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="receipt">
                  {t('vehicleExpenses.fieldReceipt')}
                </Label>
                <Input
                  id="receipt"
                  type="file"
                  accept="image/*"
                  onChange={(e) => onReceipt(e.target.files?.[0] ?? null)}
                  required={!receiptPreview}
                />
                <p className="text-xs text-muted-foreground">
                  {t('vehicleExpenses.receiptHint')}
                </p>
                {receiptPreview ? (
                  <div className="mt-2 flex items-center gap-3 rounded-md border border-border bg-muted/30 p-2">
                    <img
                      src={receiptPreview}
                      alt="receipt"
                      className="h-20 w-20 rounded-md border object-cover"
                    />
                    <span className="text-sm text-emerald-600">
                      {t('vehicleExpenses.receiptAttached')}
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {saving
                    ? t('vehicleExpenses.saving')
                    : t('vehicleExpenses.submit')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4" />
            {t('vehicleExpenses.mine')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('vehicleExpenses.colDate')}</TableHead>
                  <TableHead>{t('vehicleExpenses.colVehicle')}</TableHead>
                  <TableHead>{t('vehicleExpenses.colType')}</TableHead>
                  <TableHead className="text-end tabular-nums">
                    {t('vehicleExpenses.colAmount')}
                  </TableHead>
                  <TableHead>{t('vehicleExpenses.colVendor')}</TableHead>
                  <TableHead>{t('vehicleExpenses.colReceipt')}</TableHead>
                  <TableHead>{t('vehicleExpenses.colStatus')}</TableHead>
                  <TableHead>{t('vehicleExpenses.colReason')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : sorted.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-10 text-center text-muted-foreground"
                    >
                      {t('vehicleExpenses.empty')}
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {new Date(row.expenseDate).toLocaleDateString(
                          dateLocale,
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>{row.vehiclePlate}</div>
                        {row.vehicleLabel ? (
                          <div className="text-xs text-muted-foreground">
                            {row.vehicleLabel}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {t(`vehicleExpenses.typeLabel.${row.expenseType}`)}
                      </TableCell>
                      <TableCell className="text-end font-semibold tabular-nums">
                        {formatKwdLabel(row.amount)}
                      </TableCell>
                      <TableCell>{row.vendorName ?? '—'}</TableCell>
                      <TableCell>
                        {row.receiptUrl ? (
                          <a
                            href={row.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {t('vehicleExpenses.viewReceipt')}
                          </a>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${statusChipClass(
                            row.status,
                          )}`}
                        >
                          {t(`vehicleExpenses.statusLabel.${row.status}`)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.rejectionReason ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
