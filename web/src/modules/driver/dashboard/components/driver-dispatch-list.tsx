import type { DriverTask, DriverTaskSeverity } from '../../tasks/hooks/use-driver-tasks';

type DriverDispatchListProps = {
  dispatches: DriverTask[];
  onDispatchViewed: (dispatchId: string) => void;
  onAcknowledge: (dispatchId: string) => void;
  acknowledgingId: string | null;
};

const severityClass: Record<DriverTaskSeverity, string> = {
  ON_TIME: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  LATE: 'bg-amber-100 text-amber-900 border-amber-200',
  CRITICAL: 'bg-red-100 text-red-800 border-red-200',
  COMPLETED: 'bg-slate-100 text-slate-700 border-slate-200',
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('ar-KW', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function DriverDispatchList({
  dispatches,
  onDispatchViewed,
  onAcknowledge,
  acknowledgingId,
}: DriverDispatchListProps) {
  if (dispatches.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
        لا توجد مهام حالياً
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {dispatches.map((dispatch) => (
        <article
          key={dispatch.id}
          onClick={() => onDispatchViewed(dispatch.id)}
          className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-start shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold text-slate-950">
                {dispatch.customerDisplay}
              </h3>
              {dispatch.customerPhone ? (
                <p className="mt-1 text-sm text-slate-600">
                  {dispatch.customerPhone}
                </p>
              ) : null}
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold ${severityClass[dispatch.severity]}`}
            >
              {dispatch.severity}
            </span>
          </div>

          {dispatch.status === 'ASSIGNED' ? (
            <div className="mt-3 inline-flex animate-pulse items-center rounded-full bg-red-600 px-3 py-1 text-sm font-bold text-white">
              🚨 مهمة جديدة
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <span>{formatDate(dispatch.createdAtIso)}</span>
            <span>{dispatch.elapsedMinutes} دقيقة</span>
          </div>

          {dispatch.instructionNote ? (
            <p className="mt-3 rounded-xl bg-slate-100 p-3 text-sm leading-6 text-slate-700">
              {dispatch.instructionNote}
            </p>
          ) : null}

          {dispatch.status === 'ASSIGNED' ? (
            <button
              type="button"
              disabled={acknowledgingId !== null}
              onClick={(event) => {
                event.stopPropagation();
                onAcknowledge(dispatch.id);
              }}
              className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {acknowledgingId === dispatch.id ? 'جاري الاستلام...' : 'استلمت'}
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}
