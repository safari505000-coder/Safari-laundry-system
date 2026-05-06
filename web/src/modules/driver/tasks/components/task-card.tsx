import type { DriverTask, DriverTaskSeverity } from '../hooks/use-driver-tasks';

type TaskCardProps = {
  task: DriverTask;
  onView: (taskId: string) => void;
  onAcknowledge: (taskId: string) => void;
  acknowledgingId: string | null;
};

const severityClasses: Record<DriverTaskSeverity, string> = {
  ON_TIME: 'border-emerald-200 bg-emerald-100 text-emerald-800',
  LATE: 'border-amber-200 bg-amber-100 text-amber-900',
  CRITICAL: 'border-red-200 bg-red-100 text-red-800',
  COMPLETED: 'border-slate-200 bg-slate-100 text-slate-700',
};

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('ar-KW', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function TaskCard({
  task,
  onView,
  onAcknowledge,
  acknowledgingId,
}: TaskCardProps) {
  const address = task.customerAddress ?? task.address ?? null;

  return (
    <article
      onClick={() => onView(task.id)}
      className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-start shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-slate-950">
            {task.customerDisplay}
          </h2>
          {task.customerPhone ? (
            <p className="mt-1 text-sm text-slate-600">{task.customerPhone}</p>
          ) : null}
          <p className="mt-1 text-sm text-slate-600">
            {address?.trim() ? address : '—'}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-bold ${severityClasses[task.severity]}`}
        >
          {task.severity}
        </span>
      </div>

      {task.status === 'ASSIGNED' ? (
        <div className="mt-3 inline-flex animate-pulse items-center rounded-full bg-red-600 px-3 py-1 text-sm font-bold text-white">
          🚨 مهمة جديدة
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>{formatCreatedAt(task.createdAtIso)}</span>
        <span>{task.status}</span>
      </div>

      {task.instructionNote ? (
        <p className="mt-3 rounded-xl bg-slate-100 p-3 text-sm leading-6 text-slate-700">
          {task.instructionNote}
        </p>
      ) : null}

      {task.status === 'ASSIGNED' ? (
        <button
          type="button"
          disabled={acknowledgingId !== null}
          onClick={(event) => {
            event.stopPropagation();
            onAcknowledge(task.id);
          }}
          className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {acknowledgingId === task.id ? 'جاري الاستلام...' : 'استلمت'}
        </button>
      ) : null}
    </article>
  );
}
