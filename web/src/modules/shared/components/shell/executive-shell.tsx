import { Outlet } from 'react-router-dom';
import { ExecutiveHeader } from '@/modules/shared/components/shell/executive-header';
import { ExecutiveSidebar } from '@/modules/shared/components/shell/executive-sidebar';
import { shellGuidanceForRole } from '@/modules/shared/shell/resolve-shell-guidance';
import { useAuth } from '@/contexts/auth-context';

export function ExecutiveShell() {
  const { user } = useAuth();
  const guidance = shellGuidanceForRole(user?.safariRole);

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
