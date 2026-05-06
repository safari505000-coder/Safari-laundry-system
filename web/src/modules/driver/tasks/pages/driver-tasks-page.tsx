import { Loader2 } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { TaskAlert } from '../components/task-alert';
import { TaskCard } from '../components/task-card';
import { useDriverTasks } from '../hooks/use-driver-tasks';

export function DriverTasksPage() {
  const { hasRole } = useAuth();
  const {
    tasks,
    hasAssignedAlert,
    loading,
    error,
    markSeen,
    acknowledgeDispatch,
    acknowledgingId,
  } = useDriverTasks();

  if (!hasRole('DRIVER')) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="min-h-svh bg-slate-100 p-4 text-slate-950 [font-family:'Tajawal',sans-serif] sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <h1 className="text-xl font-bold">مهامك الحالية</h1>
            <p className="mt-1 text-sm text-slate-500">
              تظهر المهام المسندة لك تلقائياً بدون تحديث الصفحة
            </p>
          </div>
          <TaskAlert showAlert={hasAssignedAlert} />
        </header>

        {loading && tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-12 text-slate-600">
            <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
            <p className="text-sm font-medium">جاري تحميل المهام...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-700">
            {error}
          </div>
        ) : tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
            لا توجد مهام حالياً
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onView={markSeen}
                onAcknowledge={(id) => {
                  void acknowledgeDispatch(id);
                }}
                acknowledgingId={acknowledgingId}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
