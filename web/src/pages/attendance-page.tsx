import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  FileSpreadsheet,
  Fingerprint,
  Loader2,
  Pencil,
  Printer,
  RefreshCw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { notify } from '@/lib/notify';
import {
  exportAttendanceXlsx,
  listAttendance,
  runAttendanceSync,
  upsertManualAttendance,
  type AttendanceFilters,
  type AttendanceRow,
  type AttendanceSource,
} from '@/lib/api';
import { TableBodySkeleton } from '@/modules/shared/components/ui/skeleton-helpers';
import { Badge } from '@/modules/shared/components/ui/badge';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
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
import { Textarea } from '@/modules/shared/components/ui/textarea';

/**
 * Stage-D HR — attendance dashboard (OWNER / GENERAL_MANAGER / MANAGER /
 * ACCOUNTANT). Lists attendance rows for a date window and lets admins
 * trigger the shift→attendance sync or stamp a manual correction.
 *
 * The printable monthly report lives on a dedicated route (see
 * `attendance-report-print-page.tsx`) and opens in a new tab so the
 * user can hit Ctrl+P on a full A4 layout with the verification QR.
 */

const SOURCE_LABEL: Record<AttendanceSource, { ar: string; tone: string }> = {
  SHIFT_AUTO: {
    ar: 'من الشفت',
    tone: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  },
  BIOMETRIC: {
    ar: 'بصمة',
    tone: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  MANUAL: {
    ar: 'يدوي',
    tone: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDuration(mins: number | null): string {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}س ${m.toString().padStart(2, '0')}د`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ar-KW', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AttendancePage() {
  const { t: _t } = useTranslation();
  const { user, token } = useAuth();
  const isOwner = user?.safariRole === 'OWNER';

  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filters, setFilters] = useState<AttendanceFilters>(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from: ymd(from), to: ymd(to) };
  });

  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState<{
    userId: string;
    date: string;
    checkIn: string;
    checkOut: string;
    note: string;
  }>({
    userId: '',
    date: ymd(new Date()),
    checkIn: '',
    checkOut: '',
    note: '',
  });
  const [manualSaving, setManualSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await listAttendance(token, filters);
      setRows(data);
    } catch (e) {
      notify.error(e, { fallback: 'فشل تحميل الحضور' });
    } finally {
      setLoading(false);
    }
  }, [token, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSync = useCallback(async () => {
    if (!token) return;
    setSyncing(true);
    try {
      const from = filters.from
        ? new Date(filters.from)
        : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const to = filters.to ? new Date(filters.to) : new Date();
      const res = await runAttendanceSync(
        token,
        from.toISOString(),
        to.toISOString(),
      );
      notify.success(`تم تحديث ${res.count} سجل حضور`);
      await load();
    } catch (e) {
      notify.error(e, { fallback: 'فشلت المزامنة' });
    } finally {
      setSyncing(false);
    }
  }, [token, filters, load]);

  const onManualSave = useCallback(async () => {
    if (!token) return;
    if (!manualForm.userId) {
      notify.error('اختر الموظف أولاً');
      return;
    }
    setManualSaving(true);
    try {
      await upsertManualAttendance(token, {
        userId: manualForm.userId,
        date: manualForm.date,
        checkInAt: manualForm.checkIn
          ? new Date(`${manualForm.date}T${manualForm.checkIn}:00`).toISOString()
          : undefined,
        checkOutAt: manualForm.checkOut
          ? new Date(
              `${manualForm.date}T${manualForm.checkOut}:00`,
            ).toISOString()
          : undefined,
        note: manualForm.note || undefined,
      });
      notify.success('تم حفظ السجل');
      setManualOpen(false);
      await load();
    } catch (e) {
      notify.error(e, { fallback: 'فشل الحفظ' });
    } finally {
      setManualSaving(false);
    }
  }, [token, manualForm, load]);

  const totals = useMemo(() => {
    let present = 0;
    let biometric = 0;
    let manual = 0;
    let totalMinutes = 0;
    for (const r of rows) {
      if (r.checkInAtIso) present += 1;
      if (r.source === 'BIOMETRIC') biometric += 1;
      if (r.source === 'MANUAL') manual += 1;
      if (r.durationMinutes) totalMinutes += r.durationMinutes;
    }
    return { present, biometric, manual, totalHours: totalMinutes / 60 };
  }, [rows]);

  return (
    <div className="space-y-6 p-4">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-50">
            <Clock className="h-6 w-6 text-emerald-400" />
            سجل الحضور والانصراف
          </h1>
          <p className="text-sm text-slate-400">
            المصادر: من الشفت تلقائياً، بصمة، أو قيد يدوي. التواريخ بتوقيت الكويت.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw
              className={`ms-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            />
            تحديث
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setManualOpen(true)}
          >
            <Pencil className="ms-1 h-4 w-4" />
            قيد يدوي
          </Button>
          {isOwner ? (
            <Button size="sm" onClick={() => void onSync()} disabled={syncing}>
              {syncing ? (
                <Loader2 className="ms-1 h-4 w-4 animate-spin" />
              ) : (
                <Fingerprint className="ms-1 h-4 w-4" />
              )}
              مزامنة من الشفتات
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="إجمالي السجلات" value={rows.length.toString()} />
        <StatCard label="حضور موثق" value={totals.present.toString()} />
        <StatCard label="قراءات بصمة" value={totals.biometric.toString()} />
        <StatCard
          label="ساعات مسجلة"
          value={totals.totalHours.toFixed(1)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الفلاتر</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div>
            <Label className="text-xs">من تاريخ</Label>
            <Input
              type="date"
              value={filters.from ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, from: e.target.value || undefined }))
              }
            />
          </div>
          <div>
            <Label className="text-xs">إلى تاريخ</Label>
            <Input
              type="date"
              value={filters.to ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, to: e.target.value || undefined }))
              }
            />
          </div>
          <div>
            <Label className="text-xs">المصدر</Label>
            <Select
              value={filters.source ?? 'ALL'}
              onValueChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  source: !v || v === 'ALL' ? undefined : (v as AttendanceSource),
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">الكل</SelectItem>
                <SelectItem value="SHIFT_AUTO">من الشفت</SelectItem>
                <SelectItem value="BIOMETRIC">بصمة</SelectItem>
                <SelectItem value="MANUAL">يدوي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Link
              to={`/attendance/print?from=${filters.from ?? ''}&to=${filters.to ?? ''}`}
              target="_blank"
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-slate-700 bg-transparent px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-800"
            >
              <Printer className="ms-1 h-4 w-4" />
              طباعة A4
            </Link>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 h-[38px]"
              disabled={!token || !rows.length}
              onClick={async () => {
                if (!token) return;
                try {
                  await exportAttendanceXlsx(token, filters);
                } catch (e) {
                  notify.error(e, { fallback: 'فشل تصدير Excel' });
                }
              }}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">السجلات ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60 text-slate-300">
              <tr>
                <th className="p-3 text-start">التاريخ</th>
                <th className="p-3 text-start">الموظف</th>
                <th className="p-3 text-start">الفرع</th>
                <th className="p-3 text-start">دخول</th>
                <th className="p-3 text-start">خروج</th>
                <th className="p-3 text-start">المدة</th>
                <th className="p-3 text-start">المصدر</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableBodySkeleton rows={6} columns={7} />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    لا توجد سجلات في النطاق المحدد
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-slate-800 hover:bg-slate-800/30"
                  >
                    <td className="p-3 font-mono text-slate-200">{r.date}</td>
                    <td className="p-3">
                      <div className="text-slate-100">{r.userName}</div>
                      <div className="text-xs text-slate-500">
                        {r.username}
                        {r.employeeId ? ` — ${r.employeeId}` : ''}
                      </div>
                    </td>
                    <td className="p-3 text-slate-300">
                      {r.branchName ?? '—'}
                    </td>
                    <td className="p-3 font-mono text-emerald-300">
                      {fmtTime(r.checkInAtIso)}
                    </td>
                    <td className="p-3 font-mono text-sky-300">
                      {fmtTime(r.checkOutAtIso)}
                    </td>
                    <td className="p-3 font-mono text-slate-200">
                      {fmtDuration(r.durationMinutes)}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={SOURCE_LABEL[r.source].tone}
                      >
                        {SOURCE_LABEL[r.source].ar}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>قيد حضور يدوي</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>معرف الموظف (UUID)</Label>
              <Input
                value={manualForm.userId}
                onChange={(e) =>
                  setManualForm((f) => ({ ...f, userId: e.target.value }))
                }
                placeholder="UUID"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>التاريخ</Label>
                <Input
                  type="date"
                  value={manualForm.date}
                  onChange={(e) =>
                    setManualForm((f) => ({ ...f, date: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>دخول</Label>
                <Input
                  type="time"
                  value={manualForm.checkIn}
                  onChange={(e) =>
                    setManualForm((f) => ({ ...f, checkIn: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>خروج</Label>
                <Input
                  type="time"
                  value={manualForm.checkOut}
                  onChange={(e) =>
                    setManualForm((f) => ({ ...f, checkOut: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <Label>ملاحظة</Label>
              <Textarea
                value={manualForm.note}
                onChange={(e) =>
                  setManualForm((f) => ({ ...f, note: e.target.value }))
                }
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={() => void onManualSave()} disabled={manualSaving}>
              {manualSaving ? (
                <Loader2 className="ms-1 h-4 w-4 animate-spin" />
              ) : null}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-slate-400">{label}</div>
        <div className="mt-1 text-2xl font-semibold text-slate-100 tabular-nums">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

export default AttendancePage;
