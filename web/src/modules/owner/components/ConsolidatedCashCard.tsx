import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Wallet } from 'lucide-react';
import {
  ApiError,
  type ConsolidatedCashSnapshot,
  getConsolidatedCashSnapshot,
} from '@/lib/api';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { StatTile } from '@/modules/shared/components/ui/stat-tile';
import { formatKwdLabel } from '@/lib/kwd';

type Props = {
  token: string | null;
};

const kwFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kuwait',
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * A3.D8 — consolidated cash snapshot for the Owner / Accountant control
 * panel. Shows the four cash pools (driver field cash, manager custody
 * bags, branch wallets, unverified bank logs) alongside the institution-
 * wide total, pulled from a single API (/api/finance/consolidated-cash)
 * so every surface agrees to the last fils.
 */
export function ConsolidatedCashCard({ token }: Props) {
  const [data, setData] = useState<ConsolidatedCashSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await getConsolidatedCashSnapshot(token);
      setData(res);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <Wallet className="h-4 w-4 text-emerald-600" />
            إجمالي النقد في النظام الآن
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            مجموع كل أوعية الكاش: ميدان السائقين + عهدة المدراء + محافظ الفروع
            + إيداعات مصرفية بانتظار الاعتماد.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            تحديث
          </Button>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-foreground">
        {loading && !data ? (
          <p className="text-muted-foreground">جاري التحميل…</p>
        ) : data == null ? (
          <p className="text-muted-foreground">لا توجد بيانات متاحة حالياً.</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 dark:border-emerald-800/60 dark:bg-emerald-950/30">
              <p className="text-xs text-emerald-800 dark:text-emerald-200/80">
                الإجمالي العام
              </p>
              <p className="font-mono text-2xl font-bold tabular-nums text-emerald-950 dark:text-emerald-100">
                {formatKwdLabel(data.totalKd)}
              </p>
              <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-200/60">
                آخر تحديث: {kwFormatter.format(new Date(data.atIso))}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Pool
                label="مع السائقين (ميدان)"
                sub={`${data.breakdown.driverCount} سائق`}
                value={data.driverFieldCashKd}
              />
              <Pool
                label="عهدة المدراء"
                sub={`${data.breakdown.custodyBagCount} حقيبة`}
                value={data.managerCustodyPendingKd}
              />
              <Pool
                label="محافظ الفروع"
                sub={`${data.breakdown.branchWalletCount} فرع`}
                value={data.branchWalletsKd}
              />
              <Pool
                label="إيداعات بانتظار الاعتماد"
                sub={`${data.breakdown.unverifiedBankDepositCount} إيصال`}
                value={data.unverifiedBankDepositsKd}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Pool({
  label,
  sub,
  value,
}: {
  label: string;
  sub: string;
  value: string;
}) {
  return (
    <StatTile
      label={label}
      value={formatKwdLabel(value)}
      sub={sub}
      mono
      size="compact"
    />
  );
}
