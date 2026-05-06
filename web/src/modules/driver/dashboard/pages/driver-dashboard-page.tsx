import { Loader2 } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { DriverAlertIndicator } from '../components/driver-alert-indicator';
import { DriverDispatchList } from '../components/driver-dispatch-list';
import { useDriverDispatches } from '../hooks/use-driver-dispatches';

export function DriverDashboardPage() {
  const { hasRole } = useAuth();
  const {
    dispatches,
    hasNew,
    loading,
    error,
    markAsSeen,
    acknowledgeDispatch,
    acknowledgingId,
  } = useDriverDispatches();

  if (!hasRole('DRIVER')) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="min-h-svh bg-slate-100 p-4 text-slate-950 [font-family:'Tajawal',sans-serif] sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <h1 className="text-xl font-bold">لوحة مهام السائق</h1>
            <p className="mt-1 text-sm text-slate-500">
              المهام النشطة تظهر هنا تلقائياً بدون تحديث الصفحة
            </p>
          </div>
          <DriverAlertIndicator showAlert={hasNew} />
        </header>

        {loading && dispatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-12 text-slate-600">
            <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
            <p className="text-sm font-medium">جاري تحميل المهام...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-700">
            {error}
          </div>
        ) : (
          <DriverDispatchList
            dispatches={dispatches}
            onDispatchViewed={markAsSeen}
            onAcknowledge={(dispatchId) => {
              void acknowledgeDispatch(dispatchId);
            }}
            acknowledgingId={acknowledgingId}
          />
        )}
      </div>
    </main>
  );
}
