import { Outlet } from 'react-router-dom';
import { ExecutiveHeader } from '@/components/layout/executive-header';
import { ExecutiveSidebar } from '@/components/layout/executive-sidebar';
import { useAuth } from '@/contexts/auth-context';

function guidanceByRole(role?: string): string {
  if (role === 'DRIVER') return 'Goal: complete deliveries and hand over cash custody to office on time.';
  if (role === 'MANAGER') return 'Goal: settle driver cash and submit expense entries with receipt image (pending review).';
  if (role === 'CALL_CENTER') return 'Goal: follow up debts and monitor driver cash only (read-only).';
  if (role === 'ACCOUNTANT') return 'Goal: verify only after physical cash/receipt is in hand, then move custody to vault.';
  if (role === 'OWNER') return 'Goal: monitor filtered financial reports in read-only mode.';
  return 'Goal: follow role-specific workflow and keep data integrity.';
}

export function ExecutiveShell() {
  const { user } = useAuth();
  const guidance = guidanceByRole(user?.safariRole);

  return (
    <div className="flex min-h-svh max-w-[100vw] overflow-x-hidden bg-muted/40">
      <ExecutiveSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <ExecutiveHeader />
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 print:p-2 sm:p-6 lg:p-10">
          <div className="mx-auto min-w-0 max-w-6xl print:max-w-none">
            <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              {guidance}
            </div>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
