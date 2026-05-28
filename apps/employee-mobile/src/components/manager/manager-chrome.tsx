import type { ReactNode } from 'react';
import { RoleShell } from '@/components/role-shell';

export function ManagerChrome({
  title,
  children,
  showBack,
}: {
  title: string;
  children: ReactNode;
  showBack?: boolean;
}) {
  return (
    <RoleShell title={title} showBack={showBack}>
      {children}
    </RoleShell>
  );
}
