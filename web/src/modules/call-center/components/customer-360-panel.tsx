import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  getCustomer360,
  type Customer360ResponseInternal,
  type Customer360ResponseSanitized,
} from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import Customer360Smart from '@/modules/customers/components/Customer360Smart';
import { formatArabicKwd } from '@/lib/arabic-customer-text';

function isInternal360(
  r: Customer360ResponseInternal | Customer360ResponseSanitized,
): r is Customer360ResponseInternal {
  return r.score !== null && r.insights !== null;
}

export function Customer360Panel(props: {
  token: string | null;
  customerId: string | null;
  /** When true, expect call-center payload (score, insights). */
  expectInternal: boolean;
}) {
  const { token, customerId, expectInternal } = props;
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<
    Customer360ResponseInternal | Customer360ResponseSanitized | null
  >(null);

  useEffect(() => {
    if (!token || !customerId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await getCustomer360(token, customerId);
        if (!cancelled) {
          setData(res);
        }
      } catch (e) {
        if (!cancelled) {
          if (e instanceof ApiError) toast.error(e.message);
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, customerId]);

  if (!customerId) {
    return (
      <p className="text-sm text-muted-foreground">
        اختر عميلاً لعرض ملف ٣٦٠.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        جاري التحميل…
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const f = data.statement.financials;
  const displayName = data.customer.displayName || data.customer.phone;

  return (
    <div className="space-y-4" dir="rtl">
      <Customer360Smart
        data={{
          name: displayName,
          rating: data.rating,
          financials: f,
          subscription: data.subscription,
          insight: data.insight,
          blockReason: f.blockReason,
          onCall: () => {
            if (data.customer.phone) window.location.href = `tel:${data.customer.phone}`;
          },
          onWhatsapp: () => {
            if (data.customer.phone) {
              window.open(`https://wa.me/${data.customer.phone.replace(/\D+/g, '')}`, '_blank');
            }
          },
        }}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">الملخص المالي</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <Metric label="الفواتير" value={f.totalInvoicesKd} />
          <Metric label="المدفوع" value={f.totalPaymentsKd} />
          <Metric label="المبلغ المطلوب دفعه" value={f.totalDueKd} />
          {Number.parseFloat(data.subscription.subscriptionValueKd) > 0 ?
            <>
              <Metric label="قيمة الاشتراك" value={data.subscription.subscriptionValueKd} />
              <Metric
                label="المستهلك"
                value={data.subscription.subscriptionConsumedKd}
              />
              <Metric
                label="المتبقي من الاشتراك"
                value={data.subscription.subscriptionRemainingKd}
              />
            </>
          : <div className="text-muted-foreground">لا يوجد اشتراك</div>}
        </CardContent>
      </Card>

      {data.subscriptions.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">الاشتراكات ({data.subscriptions.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.subscriptions.slice(0, 5).map((s) => (
              <div key={s.id} className="rounded-md border p-2">
                <p className="font-medium">{s.planNameSnapshot}</p>
                <p className="text-xs text-muted-foreground">
                  {subscriptionStatusAr(s.status)} · {s.activatedAtIso.slice(0, 10)} ← {s.expiresAtIso.slice(0, 10)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {!expectInternal && 'friendlySummary' in data ? (
        <Card className="border-emerald-200/80 bg-emerald-50/40 dark:bg-emerald-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ملخص للعميل</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-muted-foreground">
            {data.friendlySummary}
          </CardContent>
        </Card>
      ) : null}

      {expectInternal && isInternal360(data) ? (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">التقييم الداخلي</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p>
                <span className="font-medium">{data.score.value}</span> / 100
                {data.score.feedbackAverage != null ?
                  ` · تقييم العميل ${data.score.feedbackAverage}`
                : null}
              </p>
              <ul className="list-disc ms-4 text-muted-foreground">
                {data.score.factors.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">ملاحظات تشغيلية</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p className="font-medium">{data.insights.summary}</p>
              <p className="text-muted-foreground">{data.insights.detail}</p>
            </CardContent>
          </Card>
          {data.statement.narrativeLines && data.statement.narrativeLines.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">تفاصيل داخلية</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1 text-muted-foreground">
                {data.statement.narrativeLines.map((line) => (
                  <p key={line.slice(0, 40)}>{line}</p>
                ))}
              </CardContent>
            </Card>
          ) : null}
          {data.alerts.length > 0 ? (
            <Card className="border-amber-200/80 bg-amber-50/50 dark:bg-amber-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">تنبيهات</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                {data.alerts.map((a) => (
                  <p key={a.code}>
                    <span className="font-mono text-xs">{a.code}</span> — {a.message}
                  </p>
                ))}
              </CardContent>
            </Card>
          ) : null}
          {data.internalNotes ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">ملاحظات داخلية</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{data.internalNotes}</CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/60 pb-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium">{formatArabicKwd(value)} د.ك</span>
    </div>
  );
}

function subscriptionStatusAr(status: string): string {
  if (status === 'ACTIVE') return 'نشط';
  if (status === 'EXPIRED') return 'منتهي';
  if (status === 'CANCELED') return 'ملغي';
  if (status === 'ROLLED_OVER') return 'مرحّل';
  return status;
}
