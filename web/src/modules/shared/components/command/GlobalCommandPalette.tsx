import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CommandPalette, type PaletteCommand } from './CommandPalette';
import { useGlobalShortcut } from '@/modules/shared/hooks/use-global-shortcut';
import { useAuth } from '@/contexts/auth-context';

/**
 * V21 Phase 3 — Global command palette mount.
 *
 * # Why
 *
 * The `CommandPalette` component + `useGlobalShortcut` hook were
 * built in V20.9 Phase 4 with full Ctrl/Cmd+K support, fuzzy
 * search, and accessibility, but were never wired into the
 * running app — they only appeared in unit tests. V21 Phase 3
 * closes that gap by mounting them inside the `ExecutiveShell`
 * with a curated default command set.
 *
 * # Behaviour
 *
 *   • `Ctrl/Cmd + K` from any authenticated route toggles the palette open.
 *   • `Esc` closes it (handled inside `CommandPalette`).
 *   • Default commands are role-aware navigation targets: dashboard,
 *     POS, Customer360, Collections, Reports, Settings.
 *   • Each command runs `navigate(...)`; no financial side-effect.
 *
 * # Hard rules
 *
 *   • Zero financial computation. The palette only navigates +
 *     focuses; it never writes.
 *   • Zero canonical projection re-derivation. It surfaces routes,
 *     not money.
 *   • Additive — does not replace any existing navigation surface
 *     (sidebar, header, command palette is purely an additional
 *     accelerator).
 */
export function GlobalCommandPalette(): ReactElement | null {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useGlobalShortcut({
    key: 'k',
    mod: 'mod',
    handler: () => {
      setOpen((o) => !o);
    },
  });

  const commands = useMemo<PaletteCommand[]>(() => {
    if (!user) return [];

    const cmds: PaletteCommand[] = [];

    const goto = (id: string, title: string, path: string, opts: Partial<PaletteCommand> = {}): void => {
      cmds.push({
        id,
        title,
        subtitle: path,
        group: opts.group ?? t('palette.groups.navigate', 'الانتقال'),
        keywords: opts.keywords,
        critical: opts.critical,
        hideFromDefault: opts.hideFromDefault,
        run: () => {
          navigate(path);
          setOpen(false);
        },
      });
    };

    goto('go-dashboard', t('palette.commands.dashboard', 'لوحة التحكم'), '/dashboard', {
      keywords: ['home', 'dashboard', 'main', 'الرئيسية'],
    });

    if (hasRole('OWNER', 'GENERAL_MANAGER', 'MANAGER', 'DRIVER')) {
      goto('go-pos', t('palette.commands.pos', 'نقطة البيع'), '/pos', {
        keywords: ['pos', 'sale', 'invoice', 'فاتورة', 'بيع'],
        critical: true,
      });
    }

    if (
      hasRole(
        'OWNER',
        'GENERAL_MANAGER',
        'CALL_CENTER',
        'CALL_CENTER_SUPERVISOR',
        'ACCOUNTANT',
      )
    ) {
      goto('go-collections', t('palette.commands.collections', 'التحصيلات'), '/collections', {
        keywords: ['collect', 'debt', 'recovery', 'تحصيل'],
      });
      goto('go-cc-dashboard', t('palette.commands.ccDashboard', 'كول سنتر'), '/cc/dashboard', {
        keywords: ['call', 'cc', 'support', 'كول'],
      });
      goto('go-customers', t('palette.commands.customers', 'العملاء'), '/customers', {
        keywords: ['customer', 'cust', 'client', 'عميل', 'عملاء'],
      });
    }

    if (hasRole('OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT')) {
      goto('go-financial-reports', t('palette.commands.financialReports', 'التقارير المالية'), '/reports-hub', {
        keywords: ['report', 'financial', 'تقرير', 'مالي'],
      });
      goto('go-operational-reports', t('palette.commands.operationalReports', 'التقارير التشغيلية'), '/operational-reports-hub', {
        keywords: ['operational', 'report', 'تقرير', 'تشغيل'],
      });
      goto('go-financials', t('palette.commands.financials', 'المالية'), '/financials', {
        keywords: ['finance', 'money', 'مالية'],
      });
      goto('go-accountant', t('palette.commands.accountant', 'لوحة المحاسب'), '/accountant-dashboard', {
        keywords: ['accountant', 'محاسب'],
      });
    }

    if (hasRole('OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT', 'MANAGER')) {
      goto('go-unpaid', t('palette.commands.unpaid', 'الفواتير غير المدفوعة'), '/unpaid-invoices', {
        keywords: ['unpaid', 'invoice', 'دفع', 'متأخر'],
      });
      goto('go-debt-holds', t('palette.commands.debtHolds', 'احتجاز الديون'), '/debt-holds', {
        keywords: ['debt', 'hold', 'ديون'],
      });
    }

    if (hasRole('OWNER', 'GENERAL_MANAGER')) {
      goto('go-system-settings', t('palette.commands.systemSettings', 'إعدادات النظام'), '/settings/dashboard', {
        keywords: ['system', 'settings', 'config', 'إعدادات'],
      });
      goto('go-staff-hub', t('palette.commands.staffHub', 'مركز الموظفين'), '/staff-hub', {
        keywords: ['staff', 'employee', 'موظف'],
      });
    }

    return cmds;
  }, [navigate, user, hasRole, t]);

  if (!user) return null;

  return (
    <CommandPalette
      open={open}
      onClose={close}
      commands={commands}
      placeholder={t('palette.placeholder', 'ابحث عن صفحة أو إجراء — Ctrl+K')}
    />
  );
}
