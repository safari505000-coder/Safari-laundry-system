import { cn } from '@/lib/utils';

/** V11.5 — uniform order row status chip (pending / completed / cancelled). */
export function orderStatusChipClass(status: string): string {
  if (status === 'COMPLETED') return 'safari-status safari-status--completed';
  if (status === 'CANCELED') return 'safari-status safari-status--cancelled';
  return 'safari-status safari-status--pending';
}

/** Expense / approval workflow labels (not the same enum as orders). */
export function expenseWorkflowChipClass(
  status: 'PENDING_ACCOUNTANT' | 'APPROVED' | 'REJECTED' | 'AUDIT' | string,
): string {
  if (status === 'APPROVED') return 'safari-status safari-status--completed';
  if (status === 'REJECTED') return 'safari-status safari-status--cancelled';
  if (status === 'AUDIT') return 'safari-status safari-status--neutral';
  return 'safari-status safari-status--pending';
}

export function safariTablePrimary(className?: string): string {
  return cn('safari-table-primary', className);
}
