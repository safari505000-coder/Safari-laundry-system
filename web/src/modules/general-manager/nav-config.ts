import type { NavGroup } from '@/modules/shared/nav/nav-types';
import {
  branchesItem,
  debtRecoveryReportItem,
  expenseApprovalItem,
  expensesItem,
  financialCycleReportItem,
  financialsItem,
  fixedExpensesItem,
  invoicesDataItem,
  knetAuditReportItem,
  managerCustodyAgingItem,
  ordersItem,
  ownerSerialsItem,
  payrollItem,
  reportsItem,
  shiftsItem,
  staffDebtsItem,
  teamItem,
  unifiedLedgerItem,
  whatsappToolsItem,
} from '@/modules/shared/nav/nav-items';

/**
 * V19.0 — GENERAL_MANAGER island (the Owner's Second Eye).
 *
 * Mirrors the Financial Island layout exactly per the Red-Line spec:
 *   • Operations      — Invoices Data, Order Logs, Driver Shifts, Sequence Management
 *   • Finance & Reports — Financial Reports, K-Net Reconciliation, Expense Approval,
 *                         Financial Cycle Report, Managers' Held Cash, Employee Debts,
 *                         Debt Collection Report, Payroll, Fixed Expenses, General Expenses
 *   • System Settings — Branch Management, Users Management
 *
 * Every item here has `GENERAL_MANAGER` in its `roles` array (see nav-items.ts),
 * so the standard `hasRole(...i.roles)` filter keeps the sidebar consistent with
 * route guards.
 */
export const generalManagerSidebarNavGroups: NavGroup[] = [
  {
    labelKey: 'nav.groupOperations',
    items: [invoicesDataItem, ordersItem, shiftsItem, ownerSerialsItem],
  },
  {
    labelKey: 'nav.groupFinance',
    items: [
      financialsItem,
      knetAuditReportItem,
      expenseApprovalItem,
      financialCycleReportItem,
      managerCustodyAgingItem,
      staffDebtsItem,
      debtRecoveryReportItem,
      reportsItem,
      unifiedLedgerItem,
      payrollItem,
      fixedExpensesItem,
      expensesItem,
    ],
  },
  {
    labelKey: 'nav.groupSystemSettings',
    items: [branchesItem, teamItem, whatsappToolsItem],
  },
];
