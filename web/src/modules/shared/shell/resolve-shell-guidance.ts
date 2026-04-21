import type { SafariRole } from '@/lib/api';
import { ACCOUNTANT_SHELL_GUIDANCE } from '@/modules/accountant/shell-guidance';
import { CALL_CENTER_SHELL_GUIDANCE } from '@/modules/call-center/shell-guidance';
import { CALL_CENTER_SUPERVISOR_SHELL_GUIDANCE } from '@/modules/call-center-supervisor/shell-guidance';
import { DRIVER_SHELL_GUIDANCE } from '@/modules/driver/shell-guidance';
import { FLEET_SUPERVISOR_SHELL_GUIDANCE } from '@/modules/fleet-supervisor/shell-guidance';
import { MANAGER_SHELL_GUIDANCE } from '@/modules/manager/shell-guidance';

const OWNER_SHELL_GUIDANCE =
  'المالك: مراقبة الأداء المالي والربح والخسارة مع صلاحيات الإدارة العليا.';

const FALLBACK_SHELL_GUIDANCE =
  'اتبع صلاحيات دورك للحفاظ على سلامة البيانات.';

export function shellGuidanceForRole(role?: SafariRole): string {
  switch (role) {
    case 'DRIVER':
      return DRIVER_SHELL_GUIDANCE;
    case 'MANAGER':
      return MANAGER_SHELL_GUIDANCE;
    case 'CALL_CENTER':
      return CALL_CENTER_SHELL_GUIDANCE;
    case 'CALL_CENTER_SUPERVISOR':
      return CALL_CENTER_SUPERVISOR_SHELL_GUIDANCE;
    case 'FLEET_SUPERVISOR':
      return FLEET_SUPERVISOR_SHELL_GUIDANCE;
    case 'ACCOUNTANT':
      return ACCOUNTANT_SHELL_GUIDANCE;
    case 'OWNER':
    case 'GENERAL_MANAGER':
      // GM shares the Owner's executive shell guidance (Dastur §3.9 —
      // "Owner's Second Eye").
      return OWNER_SHELL_GUIDANCE;
    default:
      return FALLBACK_SHELL_GUIDANCE;
  }
}
