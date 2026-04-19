import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  listAttendance,
  type AttendanceRow,
} from '@/lib/api';
import { PrintableSheet } from '@/modules/shared/print';

/**
 * Digital A4 printable attendance report.
 *
 * Accepts `from`, `to`, `userId`, `branchId` in the query string and
 * renders the same data as the on-screen attendance page inside a
 * coloured, QR-stamped A4 sheet that's ready for Ctrl+P.
 */

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ar-KW', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDuration(mins: number | null): string {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

export function AttendanceReportPrintPage() {
  const { token } = useAuth();
  const [sp] = useSearchParams();
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
      userId: sp.get('userId') ?? undefined,
      branchId: sp.get('branchId') ?? undefined,
    }),
    [sp],
  );

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    listAttendance(token, filters)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof ApiError ? e.message : 'فشل تحميل الحضور');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, filters]);

  const range = useMemo(() => {
    const from = filters.from ? new Date(filters.from) : undefined;
    const to = filters.to ? new Date(filters.to) : undefined;
    if (from && to) {
      return `${from.toLocaleDateString('ar-KW')} — ${to.toLocaleDateString('ar-KW')}`;
    }
    return 'آخر 30 يوم';
  }, [filters]);

  const totals = useMemo(() => {
    let totalMinutes = 0;
    let sessionsWithCheckout = 0;
    for (const r of rows) {
      if (r.durationMinutes) {
        totalMinutes += r.durationMinutes;
        sessionsWithCheckout += 1;
      }
    }
    return {
      totalHours: totalMinutes / 60,
      avgHours: sessionsWithCheckout > 0 ? totalMinutes / 60 / sessionsWithCheckout : 0,
    };
  }, [rows]);

  // Use the first row's id as the doc id, or a synthetic "range" marker.
  const docId = rows[0]?.id ?? 'range-report';
  const docNumber = `HR-ATT-${(filters.from ?? 'BEG').replaceAll('-', '')}-${(filters.to ?? 'END').replaceAll('-', '')}`;

  const headerEmployee =
    filters.userId && rows.length > 0 ? rows[0].userName : 'جميع الموظفين';

  return (
    <PrintableSheet
      docType="ATTENDANCE_REPORT"
      docId={docId}
      docNumber={docNumber}
      title="تقرير الحضور والانصراف"
      subtitle={`${headerEmployee} — ${range}`}
    >
      {loading ? (
        <div style={{ padding: '20mm 0', textAlign: 'center' }}>
          جارٍ تحميل البيانات…
        </div>
      ) : error ? (
        <div style={{ padding: '20mm 0', color: '#b91c1c' }}>{error}</div>
      ) : (
        <>
          <section className="printable-sheet__section">
            <h2 className="printable-sheet__section-title">ملخص الفترة</h2>
            <div className="printable-sheet__grid-3">
              <Field label="إجمالي السجلات" value={rows.length.toString()} />
              <Field
                label="إجمالي الساعات"
                value={`${totals.totalHours.toFixed(1)} س`}
              />
              <Field
                label="متوسط اليوم"
                value={`${totals.avgHours.toFixed(1)} س`}
              />
            </div>
          </section>

          <section className="printable-sheet__section">
            <h2 className="printable-sheet__section-title">تفاصيل الحضور</h2>
            {rows.length === 0 ? (
              <div
                style={{
                  padding: '6mm',
                  textAlign: 'center',
                  color: '#64748b',
                  background: '#f1f5f9',
                  borderRadius: '2mm',
                }}
              >
                لا توجد سجلات في هذا النطاق
              </div>
            ) : (
              <table className="printable-sheet__table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>الموظف</th>
                    <th>الفرع</th>
                    <th>دخول</th>
                    <th>خروج</th>
                    <th>الساعات</th>
                    <th>المصدر</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.date}</td>
                      <td>{r.userName}</td>
                      <td>{r.branchName ?? '—'}</td>
                      <td>{fmtTime(r.checkInAtIso)}</td>
                      <td>{fmtTime(r.checkOutAtIso)}</td>
                      <td>{fmtDuration(r.durationMinutes)}</td>
                      <td>
                        {r.source === 'SHIFT_AUTO'
                          ? 'شفت'
                          : r.source === 'BIOMETRIC'
                            ? 'بصمة'
                            : 'يدوي'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5}>الإجمالي</td>
                    <td>{totals.totalHours.toFixed(1)} س</td>
                    <td>{rows.length} سجل</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </section>

          <section className="printable-sheet__signatures">
            <div className="printable-sheet__signature-box">
              <div className="printable-sheet__signature-label">
                مسؤول الموارد البشرية
              </div>
              <div className="printable-sheet__signature-name">الاسم / التوقيع</div>
            </div>
            <div className="printable-sheet__signature-box">
              <div className="printable-sheet__signature-label">المدير العام</div>
              <div className="printable-sheet__signature-name">الاسم / التوقيع</div>
            </div>
          </section>
        </>
      )}
    </PrintableSheet>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="printable-sheet__field">
      <div className="printable-sheet__label">{label}</div>
      <div className="printable-sheet__value">{value}</div>
    </div>
  );
}

export default AttendanceReportPrintPage;
