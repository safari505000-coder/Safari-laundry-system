import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { notify } from '@/lib/notify';
import {
  downloadWeeklyReport,
  getAnomalies,
  getCashForecast,
  getDriverScorecard,
  listWeeklyReports,
  regenerateWeeklyReport,
  type AnomaliesResponse,
  type CashForecastResponse,
  type DriverScorecardResponse,
  type WeeklyReportEntry,
} from '@/lib/api';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { Label } from '@/modules/shared/components/ui/label';
import {
  StatTile,
  type StatTileTone,
} from '@/modules/shared/components/ui/stat-tile';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/modules/shared/components/ui/tabs';
import {
  ChartSkeleton,
  KpiRowSkeleton,
  ListItemSkeleton,
  TableSkeleton,
} from '@/modules/shared/components/ui/skeleton-helpers';
import { can } from '@/modules/shared/auth/access-matrix';

/**
 * Stage-C — AI / BI insights dashboard.
 *
 * Three domain tabs, each one driven by its own Insights API endpoint.
 * Access is capability-driven: the tabs render only for users whose
 * role unlocks them in `access-matrix.ts`. The executive weekly PDF
 * is exec-pair only.
 */
export function InsightsAiPage() {
  const { token, user } = useAuth();
  const [days, setDays] = useState(30);

  const canForecast = can(user, 'insights.cashForecast.view');
  const canAnomalies = can(user, 'insights.anomalies.view');
  const canScorecard = can(user, 'insights.driverScorecard.view');
  const canExecutive = can(user, 'insights.executive.view');

  const tabs = useMemo(() => {
    const list: Array<{ id: string; label: string }> = [];
    if (canForecast || canAnomalies) list.push({ id: 'financial', label: 'الوظائف المالية' });
    if (canExecutive) list.push({ id: 'administrative', label: 'الوظائف الإدارية' });
    if (canScorecard) list.push({ id: 'operational', label: 'الوظائف التشغيلية' });
    return list;
  }, [canForecast, canAnomalies, canExecutive, canScorecard]);

  if (!token) return null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BrainCircuit className="h-6 w-6 text-teal-700" aria-hidden />
            تحليلات AI
          </h1>
          <p className="text-sm text-muted-foreground">
            رؤى ذكية مرتبة حسب المجال: مالي، إداري، تشغيلي. تتولّد تلقائياً من بيانات النظام بدون إدخال يدوي.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="days" className="text-xs text-muted-foreground">
              نافذة التحليل (يوم)
            </Label>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger id="days" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="14">14 يوم</SelectItem>
                <SelectItem value="30">30 يوم</SelectItem>
                <SelectItem value="60">60 يوم</SelectItem>
                <SelectItem value="90">90 يوم</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {tabs.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            لا توجد لوحات متاحة لدورك الحالي.
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue={tabs[0].id}>
          <TabsList>
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {(canForecast || canAnomalies) && (
            <TabsContent value="financial" className="space-y-5 pt-4">
              {canForecast && <CashForecastCard token={token} days={days} />}
              {canAnomalies && <AnomaliesCard token={token} days={days} />}
            </TabsContent>
          )}

          {canExecutive && (
            <TabsContent value="administrative" className="space-y-5 pt-4">
              <ExecutiveReportCard token={token} />
            </TabsContent>
          )}

          {canScorecard && (
            <TabsContent value="operational" className="space-y-5 pt-4">
              <DriverScorecardCard token={token} days={days} />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

// ─── Cash forecast card ────────────────────────────────────────────

function CashForecastCard({ token, days }: { token: string; days: number }) {
  const [data, setData] = useState<CashForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCashForecast(token, days);
      setData(res);
    } catch (e) {
      notify.error(e);
    } finally {
      setLoading(false);
    }
  }, [token, days]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-600" aria-hidden />
            توقع التدفق النقدي
          </CardTitle>
          <CardDescription>
            التنبؤ بالإيرادات والمصروفات وصافي الكاش خلال الأيام القادمة اعتماداً على متوسط متحرك مع موسمية أسبوعية.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !data ? (
          <div className="space-y-4">
            <KpiRowSkeleton count={6} className="md:grid-cols-3" />
            <ChartSkeleton height={180} />
            <ChartSkeleton height={180} />
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <StatTile
                label="متوسط الإيراد اليومي"
                value={`${data.summary.avgDailyRevenue.toFixed(3)} د.ك`}
                tone="success"
                size="compact"
              />
              <StatTile
                label="متوسط المصروف اليومي"
                value={`${data.summary.avgDailyExpense.toFixed(3)} د.ك`}
                tone="danger"
                size="compact"
              />
              <StatTile
                label="متوسط صافي الكاش"
                value={`${data.summary.avgDailyNet.toFixed(3)} د.ك`}
                tone={toNetTone(data.summary.avgDailyNet)}
                size="compact"
              />
              <StatTile
                label={`إيراد متوقع (${data.horizonDays} يوم)`}
                value={`${data.summary.forecastTotalRevenue.toFixed(3)} د.ك`}
                tone="success"
                size="compact"
              />
              <StatTile
                label={`مصروف متوقع (${data.horizonDays} يوم)`}
                value={`${data.summary.forecastTotalExpense.toFixed(3)} د.ك`}
                tone="danger"
                size="compact"
              />
              <StatTile
                label={`صافي متوقع (${data.horizonDays} يوم)`}
                value={`${data.summary.forecastTotalNet.toFixed(3)} د.ك`}
                tone={toNetTone(data.summary.forecastTotalNet)}
                size="compact"
              />
            </div>

            <LineChart
              title="صافي الكاش اليومي — تاريخي + متوقع"
              historical={data.historical.map((p) => ({ date: p.date, value: p.netCash }))}
              forecast={data.forecast.map((p) => ({ date: p.date, value: p.netCash }))}
            />

            <LineChart
              title="الإيرادات اليومية"
              historical={data.historical.map((p) => ({ date: p.date, value: p.revenue }))}
              forecast={data.forecast.map((p) => ({ date: p.date, value: p.revenue }))}
              historicalColor="#0F766E"
              forecastColor="#10B981"
            />
          </>
        ) : (
          <div className="text-sm text-muted-foreground">لا توجد بيانات.</div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Anomalies card ────────────────────────────────────────────────

function AnomaliesCard({ token, days }: { token: string; days: number }) {
  const [data, setData] = useState<AnomaliesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAnomalies(token, days);
      setData(res);
    } catch (e) {
      notify.error(e);
    } finally {
      setLoading(false);
    }
  }, [token, days]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden />
            كشف الشذوذ
          </CardTitle>
          <CardDescription>
            أيام إيراد أو مصروف خارج النطاق الطبيعي (Z ≥ 2). تنبيه مبكر قبل أن يتحول الخلل إلى مشكلة كبيرة.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !data ? (
          <div className="grid gap-4 md:grid-cols-2">
            <ChartSkeleton height={120} />
            <ChartSkeleton height={120} />
          </div>
        ) : data ? (
          <div className="grid gap-4 md:grid-cols-2">
            <AnomalyPanel title="الإيرادات" series={data.revenue.series.map((p) => ({ date: p.date, value: p.value }))} flags={data.revenue.anomalies} />
            <AnomalyPanel title="المصروفات" series={data.expense.series.map((p) => ({ date: p.date, value: p.value }))} flags={data.expense.anomalies} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AnomalyPanel({
  title,
  series,
  flags,
}: {
  title: string;
  series: Array<{ date: string; value: number }>;
  flags: Array<{ date: string; value: number; expected: number; zScore: number; direction: 'HIGH' | 'LOW' }>;
}) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{flags.length} تنبيه</span>
      </div>
      <LineChart historical={series} forecast={[]} compact />
      {flags.length === 0 ? (
        <p className="text-xs text-muted-foreground">لا تنبيهات — الأداء ضمن النطاق الطبيعي.</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {flags.slice(0, 5).map((f) => (
            <li
              key={f.date}
              className={`flex items-center justify-between rounded px-2 py-1 ${
                f.direction === 'HIGH' ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'
              }`}
            >
              <span className="flex items-center gap-1">
                {f.direction === 'HIGH' ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {f.date}
              </span>
              <span>
                {f.value.toFixed(3)} د.ك · متوقع {f.expected.toFixed(3)} · Z {f.zScore.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Executive weekly report card ──────────────────────────────────

function ExecutiveReportCard({ token }: { token: string }) {
  const [entries, setEntries] = useState<WeeklyReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listWeeklyReports(token);
      setEntries(res);
    } catch (e) {
      notify.error(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const regenerate = async () => {
    setBusy(true);
    try {
      const entry = await regenerateWeeklyReport(token);
      notify.success(`تم تحديث تقرير ${entry.key}`);
      await load();
    } catch (e) {
      notify.error(e);
    } finally {
      setBusy(false);
    }
  };

  const download = async (key: string) => {
    try {
      await downloadWeeklyReport(token, key);
    } catch (e) {
      notify.error(e);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-teal-700" aria-hidden />
            التقرير التنفيذي الأسبوعي
          </CardTitle>
          <CardDescription>
            تقرير PDF آلي يُولَّد كل أحد 07:00 (توقيت الكويت). يحتوي على ملخص مالي وتشغيلي وأبرز السائقين.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button onClick={() => void regenerate()} disabled={busy} size="sm" className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            إعادة توليد الأسبوع الحالي
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && entries.length === 0 ? (
          <ListItemSkeleton count={3} />
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لا توجد تقارير بعد — اضغط "إعادة توليد الأسبوع الحالي" لتوليد أول تقرير.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {entries.map((e) => (
              <li key={e.key} className="flex items-center justify-between gap-2 p-3">
                <div>
                  <div className="text-sm font-medium">{e.key}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(e.generatedAt).toLocaleString('ar-KW')} · {(e.sizeBytes / 1024).toFixed(1)} KB
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => void download(e.key)} className="gap-2">
                  <Download className="h-4 w-4" />
                  تحميل PDF
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Driver scorecard card ─────────────────────────────────────────

function DriverScorecardCard({ token, days }: { token: string; days: number }) {
  const [data, setData] = useState<DriverScorecardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDriverScorecard(token, days);
      setData(res);
    } catch (e) {
      notify.error(e);
    } finally {
      setLoading(false);
    }
  }, [token, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const drivers = data?.drivers ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-indigo-600" aria-hidden />
            تقييم أداء السائقين
          </CardTitle>
          <CardDescription>
            مؤشر مركّب 0–100 من: عدد الرحلات (40%)، متوسط الإيراد للرحلة (30%)، متوسط وقت الإنجاز معكوس (30%).
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <TableSkeleton rows={6} columns={8} withHeader={false} />
        ) : drivers.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد رحلات مكتملة خلال الفترة.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="p-2 text-start">#</th>
                  <th className="p-2 text-start">السائق</th>
                  <th className="p-2 text-start">الفرع</th>
                  <th className="p-2 text-end">الرحلات</th>
                  <th className="p-2 text-end">الإيراد (د.ك)</th>
                  <th className="p-2 text-end">الإيراد/رحلة</th>
                  <th className="p-2 text-end">زمن الإنجاز (س)</th>
                  <th className="p-2 text-end">النتيجة</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d, i) => (
                  <tr key={d.driverId} className="border-b">
                    <td className="p-2">{i + 1}</td>
                    <td className="p-2 font-medium">{d.fullName}</td>
                    <td className="p-2 text-muted-foreground">{d.branchName ?? '—'}</td>
                    <td className="p-2 text-end">{d.trips}</td>
                    <td className="p-2 text-end">{d.revenueKd.toFixed(3)}</td>
                    <td className="p-2 text-end">{d.revenuePerTripKd.toFixed(3)}</td>
                    <td className="p-2 text-end">{d.avgTurnaroundHours.toFixed(2)}</td>
                    <td className="p-2 text-end">
                      <ScorePill score={d.score} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScorePill({ score }: { score: number }) {
  const tone =
    score >= 75
      ? 'bg-emerald-100 text-emerald-900'
      : score >= 50
        ? 'bg-amber-100 text-amber-900'
        : 'bg-rose-100 text-rose-900';
  return (
    <span className={`inline-block min-w-12 rounded-full px-2 py-0.5 text-center font-semibold ${tone}`}>
      {score.toFixed(1)}
    </span>
  );
}

// ─── small visual helpers ──────────────────────────────────────────

/** Map a signed net-cash figure to a StatTile tone. */
function toNetTone(net: number): StatTileTone {
  return net >= 0 ? 'success' : 'danger';
}

/**
 * Dependency-free SVG line chart with historical + forecast overlay.
 * Axes are implicit (labels only on min/max) to keep the card
 * lightweight; the point of these charts is pattern recognition, not
 * precise reading (the KPI tiles give the exact numbers).
 */
function LineChart({
  title,
  historical,
  forecast,
  historicalColor = '#0F766E',
  forecastColor = '#10B981',
  compact = false,
}: {
  title?: string;
  historical: Array<{ date: string; value: number }>;
  forecast: Array<{ date: string; value: number }>;
  historicalColor?: string;
  forecastColor?: string;
  compact?: boolean;
}) {
  const all = [...historical, ...forecast];
  const width = 720;
  const height = compact ? 110 : 180;
  const pad = compact ? 8 : 16;
  const values = all.map((p) => p.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const range = max - min || 1;
  const step = all.length > 1 ? (width - pad * 2) / (all.length - 1) : 0;

  const project = (i: number, v: number) => {
    const x = pad + i * step;
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return [x, y] as const;
  };

  const histPath = historical
    .map((p, i) => {
      const [x, y] = project(i, p.value);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const forecastPath = forecast
    .map((p, j) => {
      const i = historical.length + j;
      const [x, y] = project(i, p.value);
      return `${j === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const zeroLineY =
    min <= 0 && max >= 0
      ? height - pad - ((0 - min) / range) * (height - pad * 2)
      : null;

  return (
    <div>
      {title ? <div className="mb-1 text-xs font-medium text-muted-foreground">{title}</div> : null}
      <div className="rounded border bg-slate-50 p-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={title ?? 'chart'}>
          {zeroLineY != null ? (
            <line
              x1={pad}
              x2={width - pad}
              y1={zeroLineY}
              y2={zeroLineY}
              stroke="#CBD5E1"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          ) : null}
          {histPath ? (
            <path d={histPath} fill="none" stroke={historicalColor} strokeWidth={2} />
          ) : null}
          {forecastPath ? (
            <path d={forecastPath} fill="none" stroke={forecastColor} strokeWidth={2} strokeDasharray="4 3" />
          ) : null}
        </svg>
        {!compact && all.length > 0 ? (
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{all[0]?.date}</span>
            <span>
              تاريخي{' '}
              <span
                className="mx-1 inline-block h-1.5 w-4 align-middle"
                style={{ backgroundColor: historicalColor }}
              />
              · متوقع{' '}
              <span
                className="mx-1 inline-block h-1.5 w-4 align-middle"
                style={{ backgroundColor: forecastColor, opacity: 0.8 }}
              />
            </span>
            <span>{all[all.length - 1]?.date}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
