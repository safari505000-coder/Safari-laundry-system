import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type BankDepositLogEntry,
  type BankDepositType,
  getBankDeposits,
  uploadBankDeposit,
  verifyBankDeposit,
  ApiError,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { Badge } from '@/modules/shared/components/ui/badge';
import { Button } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';

export function BankDepositsPage() {
  const { t } = useTranslation();
  const dateLocale = useAppLocale();
  const { token, hasRole } = useAuth();
  const [entries, setEntries] = useState<BankDepositLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [depositType, setDepositType] = useState<BankDepositType>(
    'CASH_DEPOSIT_SLIP',
  );
  const [amount, setAmount] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [verifyBusyId, setVerifyBusyId] = useState<string | null>(null);

  const canView = hasRole('OWNER', 'ACCOUNTANT', 'MANAGER') ?? false;
  const isOwner = hasRole('OWNER') ?? false;
  const isAccountant = hasRole('ACCOUNTANT') ?? false;
  const isManager = hasRole('MANAGER') ?? false;
  const ownerReadOnly = isOwner && !isAccountant && !isManager;

  const load = useCallback(async () => {
    if (!token || !canView) return;
    setLoading(true);
    try {
      const res = await getBankDeposits(token, { take: 200 });
      setEntries(res.entries);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, canView]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token || !isOwner) return;
    const id = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(id);
  }, [token, isOwner, load]);

  const onUpload = async () => {
    if (!token || !isManager) return;
    const n = Number.parseFloat(amount.replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0) {
      toast.error(t('bankDeposits.invalidAmount'));
      return;
    }
    if (!file) {
      toast.error(t('bankDeposits.needFile'));
      return;
    }
    setUploading(true);
    try {
      await uploadBankDeposit(token, {
        file,
        depositType,
        amount: n,
        shiftId: shiftId.trim() || undefined,
      });
      toast.success(t('bankDeposits.uploadSuccess'));
      setAmount('');
      setShiftId('');
      setFile(null);
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const onVerify = async (id: string) => {
    if (!token || !isAccountant) return;
    setVerifyBusyId(id);
    try {
      await verifyBankDeposit(token, id);
      toast.success(t('bankDeposits.verifySuccess'));
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setVerifyBusyId(null);
    }
  };

  const typeLabel = (type: BankDepositType) =>
    type === 'CASH_DEPOSIT_SLIP' ?
      t('bankDeposits.typeCashSlip')
    : t('bankDeposits.typeKnetZ');

  if (!canView) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t('bankDeposits.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('bankDeposits.subtitle')}</p>
      </header>

      {isManager ?
        <Card className="rounded-[20px] border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">{t('bankDeposits.uploadSection')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2 sm:col-span-1">
              <Label>{t('bankDeposits.fieldType')}</Label>
              <Select
                value={depositType}
                onValueChange={(v) => {
                  if (v === 'CASH_DEPOSIT_SLIP' || v === 'KNET_Z_REPORT') {
                    setDepositType(v);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH_DEPOSIT_SLIP">
                    {t('bankDeposits.typeCashSlip')}
                  </SelectItem>
                  <SelectItem value="KNET_Z_REPORT">
                    {t('bankDeposits.typeKnetZ')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bd-amount">{t('bankDeposits.fieldAmount')}</Label>
              <Input
                id="bd-amount"
                inputMode="decimal"
                placeholder="0.0000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bd-shift">{t('bankDeposits.fieldShiftOptional')}</Label>
              <Input
                id="bd-shift"
                placeholder={t('bankDeposits.shiftPlaceholder')}
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="bd-file">{t('bankDeposits.fieldFile')}</Label>
              <input
                id="bd-file"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="block w-full text-sm text-muted-foreground file:me-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Button
                type="button"
                disabled={uploading || !file}
                onClick={() => void onUpload()}
              >
                {uploading ?
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    {t('bankDeposits.uploading')}
                  </>
                : t('bankDeposits.uploadSubmit')}
              </Button>
            </div>
          </CardContent>
        </Card>
      : null}

      {ownerReadOnly ?
        <p className="text-sm text-muted-foreground">{t('bankDeposits.ownerReadOnlyHint')}</p>
      : null}

      <Card className="rounded-[20px] border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{t('bankDeposits.logTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 sm:p-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('bankDeposits.colDate')}</TableHead>
                <TableHead className="text-end">{t('bankDeposits.colAmount')}</TableHead>
                <TableHead>{t('bankDeposits.colType')}</TableHead>
                <TableHead>{t('bankDeposits.colReceipt')}</TableHead>
                <TableHead>{t('bankDeposits.colStatus')}</TableHead>
                <TableHead>{t('bankDeposits.colVerified')}</TableHead>
                {isAccountant ?
                  <TableHead className="w-[140px]">{t('bankDeposits.colActions')}</TableHead>
                : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ?
                <TableRow>
                  <TableCell colSpan={isAccountant ? 7 : 6} className="text-center text-muted-foreground">
                    ...
                  </TableCell>
                </TableRow>
              : entries.length === 0 ?
                <TableRow>
                  <TableCell colSpan={isAccountant ? 7 : 6} className="text-center text-muted-foreground">
                    {t('bankDeposits.empty')}
                  </TableCell>
                </TableRow>
              : entries.map((row) => {
                  const pending = !row.verifiedAt;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {new Date(row.createdAt).toLocaleString(dateLocale, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </TableCell>
                      <TableCell className="text-end tabular-nums font-medium">
                        {formatKwdLabel(row.amountKd)}
                      </TableCell>
                      <TableCell className="text-sm">{typeLabel(row.depositType)}</TableCell>
                      <TableCell>
                        <a
                          href={row.receiptImageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {t('bankDeposits.openReceipt')}
                        </a>
                      </TableCell>
                      <TableCell>
                        {pending ?
                          <Badge variant="secondary">
                            {t('bankDeposits.statusPending')}
                          </Badge>
                        : <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                            {t('bankDeposits.statusVerified')}
                          </Badge>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.verifiedByAccountant ?
                          <>
                            <span className="font-medium text-foreground">
                              {t('bankDeposits.yes')}
                            </span>
                            <span className="text-muted-foreground">
                              {' — '}
                              {row.verifiedByAccountant.fullName}
                            </span>
                          </>
                        : <span className="text-muted-foreground">{t('bankDeposits.no')}</span>}
                      </TableCell>
                      {isAccountant ?
                        <TableCell>
                          {pending ?
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={verifyBusyId === row.id}
                              onClick={() => void onVerify(row.id)}
                            >
                              {verifyBusyId === row.id ?
                                <Loader2 className="h-4 w-4 animate-spin" />
                              : t('bankDeposits.verifyButton')}
                            </Button>
                          : null}
                        </TableCell>
                      : null}
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

