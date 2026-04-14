import { Outlet } from 'react-router-dom';
import { ExecutiveHeader } from '@/components/layout/executive-header';
import { ExecutiveSidebar } from '@/components/layout/executive-sidebar';

export function ExecutiveShell() {
  return (
    <div className="flex min-h-svh bg-muted/40">
      <ExecutiveSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <ExecutiveHeader />
        <main className="flex-1 overflow-auto p-6 lg:p-10">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
