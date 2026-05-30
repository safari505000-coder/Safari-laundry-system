import { SafariRole } from '@prisma/client';

export function isManagerOrOwner(role: string): boolean {
  return (
    role === SafariRole.OWNER ||
    role === SafariRole.GENERAL_MANAGER ||
    role === SafariRole.MANAGER
  );
}

export function canViewAllOrders(role: string): boolean {
  return (
    isManagerOrOwner(role) ||
    role === SafariRole.CALL_CENTER ||
    role === SafariRole.CALL_CENTER_SUPERVISOR ||
    role === SafariRole.ACCOUNTANT ||
    role === SafariRole.SUPERVISOR ||
    role === SafariRole.VIEWER
  );
}

/** Back-office roles that may change order status/notes (excludes owner read-only). */
export function canStaffUpdateOrders(role: string): boolean {
  return role === SafariRole.MANAGER || role === SafariRole.SUPERVISOR;
}
