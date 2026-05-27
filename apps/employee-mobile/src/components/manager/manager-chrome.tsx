import type { ReactNode } from 'react';
import { RoleShell } from '@/components/role-shell';

export function ManagerChrome({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <RoleShell title={title}>
      {children}
    </RoleShell>
  );
}
