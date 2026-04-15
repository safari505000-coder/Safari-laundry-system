import { Outlet } from 'react-router-dom';
import { ExecutiveHeader } from '@/components/layout/executive-header';
import { ExecutiveSidebar } from '@/components/layout/executive-sidebar';

export function ExecutiveShell() {
  return (
    <div className="flex min-h-svh max-w-[100vw] overflow-x-hidden bg-muted/40">
      <ExecutiveSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <ExecutiveHeader />
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 print:p-2 sm:p-6 lg:p-10">
          <div className="mx-auto min-w-0 max-w-6xl print:max-w-none">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
