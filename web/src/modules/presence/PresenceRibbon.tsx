import * as React from 'react';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PresenceHeartbeat } from './types';

/**
 * V23 Phase 6 — Presence ribbon (visibility-only).
 *
 * Renders a compact, accessible badge listing the operators that
 * are concurrently viewing the same operational scope (customer,
 * collection row, …). It is purely informational — clicking it
 * does NOT mutate any business state.
 */

export interface PresenceRibbonProps {
  /** Live coviewers (already excluding the current user, server-side). */
  coviewers: PresenceHeartbeat[];
  /** Optional class for layout integration. */
  className?: string;
  /** Override the default empty-state message. */
  emptyMessage?: string;
  /** Hide the icon prefix (compact mode). */
  iconHidden?: boolean;
  /** Aria label override (defaults to Arabic). */
  ariaLabel?: string;
}

const ROLE_LABELS_AR: Record<string, string> = {
  OWNER: 'المالك',
  GENERAL_MANAGER: 'المدير العام',
  MANAGER: 'مدير',
  ACCOUNTANT: 'محاسب',
  SUPERVISOR: 'مشرف',
  CALL_CENTER: 'كول سنتر',
  CALL_CENTER_SUPERVISOR: 'مشرف كول سنتر',
  VIEWER: 'مشاهد',
};

function operatorDisplayName(op: PresenceHeartbeat): string {
  return op.fullName?.trim() || op.username;
}

function operatorRoleLabel(op: PresenceHeartbeat): string {
  return ROLE_LABELS_AR[op.safariRole] ?? op.safariRole;
}

export const PresenceRibbon: React.FC<PresenceRibbonProps> = ({
  coviewers,
  className,
  emptyMessage = 'لا يوجد موظفون آخرون يشاهدون هذا السجل حالياً',
  iconHidden = false,
  ariaLabel,
}) => {
  if (!coviewers || coviewers.length === 0) {
    return (
      <div
        role="status"
        aria-label={ariaLabel ?? 'حالة المشاهدة الحية'}
        className={cn(
          'flex items-center gap-2 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500',
          className,
        )}
      >
        {!iconHidden && <Users className="h-3.5 w-3.5" aria-hidden="true" />}
        <span>{emptyMessage}</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={
        ariaLabel ??
        `يشاهد هذا السجل ${coviewers.length} موظف${coviewers.length > 1 ? 'ون' : ''} الآن`
      }
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900',
        className,
      )}
      data-testid="presence-ribbon"
    >
      {!iconHidden && <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span className="font-semibold">يعمل عليه الآن:</span>
      <ul className="flex flex-wrap items-center gap-1.5" data-testid="presence-list">
        {coviewers.map((op) => (
          <li
            key={op.userId}
            title={`${operatorDisplayName(op)} • ${operatorRoleLabel(op)} • ${op.lastSeenAt}`}
            className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 ring-1 ring-amber-300"
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"
              aria-hidden="true"
            />
            <span className="font-medium">{operatorDisplayName(op)}</span>
            <span className="text-[10px] text-amber-700">
              ({operatorRoleLabel(op)})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

PresenceRibbon.displayName = 'PresenceRibbon';
