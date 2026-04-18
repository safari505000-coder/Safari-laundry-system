import {
  Banknote,
  BookText,
  Building2,
  CircleDollarSign,
  ClipboardList,
  Droplets,
  FileCheck2,
  FileSpreadsheet,
  HandCoins,
  Landmark,
  LayoutDashboard,
  LineChart,
  ListOrdered,
  MessageCircle,
  MessageSquare,
  Package,
  PackagePlus,
  Radar,
  Receipt,
  ShieldAlert,
  Warehouse,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  WalletCards,
} from 'lucide-react';
import type { NavItem } from '@/modules/shared/nav/nav-types';

export const posItem: NavItem = {
  to: '/pos',
  labelKey: 'nav.pos',
  icon: ShoppingCart,
  roles: ['DRIVER', 'MANAGER'],
};

export const manageItemsItem: NavItem = {
  to: '/manage-items',
  labelKey: 'nav.manageItems',
  icon: ClipboardList,
  roles: ['OWNER'],
};

export const ownerDashboardItem: NavItem = {
  to: '/owner-profit-radar',
  labelKey: 'nav.ownerDashboard',
  icon: LayoutDashboard,
  roles: ['OWNER'],
};

export const myDepositsItem: NavItem = {
  to: '/my-deposits',
  labelKey: 'nav.myDeposits',
  icon: CircleDollarSign,
  roles: ['DRIVER'],
};

export const myDailySalesItem: NavItem = {
  to: '/my-daily-sales',
  labelKey: 'nav.myDailySales',
  icon: LayoutDashboard,
  roles: ['DRIVER'],
};

export const dashboardItem: NavItem = {
  to: '/',
  labelKey: 'nav.dashboard',
  icon: LayoutDashboard,
  roles: [
    'OWNER',
    'MANAGER',
    'DRIVER',
    'CALL_CENTER',
    'ACCOUNTANT',
    'SUPERVISOR',
    'VIEWER',
  ],
};

export const subscriptionsItem: NavItem = {
  to: '/subscriptions',
  labelKey: 'nav.subscriptions',
  icon: Sparkles,
  roles: ['OWNER', 'CALL_CENTER'],
};

export const subscribersItem: NavItem = {
  to: '/subscribers',
  labelKey: 'nav.subscribers',
  icon: ListOrdered,
  roles: ['OWNER', 'CALL_CENTER'],
};

export const customersItem: NavItem = {
  to: '/customers',
  labelKey: 'nav.customers',
  icon: Users,
  // Dastur §5 — CALL_CENTER is the CRM island. Owner keeps full access.
  roles: ['OWNER', 'CALL_CENTER'],
};

export const collectionsItem: NavItem = {
  to: '/collections',
  labelKey: 'nav.customerDebtTracker',
  icon: MessageSquare,
  // Dastur §5 — Tahseel (debt recovery) is a CALL_CENTER core surface.
  roles: ['OWNER', 'CALL_CENTER'],
};

export const whatsappToolsItem: NavItem = {
  to: '/whatsapp-tools',
  labelKey: 'nav.whatsappTools',
  icon: MessageCircle,
  roles: ['OWNER', 'ACCOUNTANT'],
};

export const myCashCustodyItem: NavItem = {
  to: '/my-cash-custody',
  labelKey: 'nav.myCashCustody',
  icon: CircleDollarSign,
  roles: ['DRIVER'],
};

export const driverFieldExpensesItem: NavItem = {
  to: '/my-field-expenses',
  labelKey: 'nav.driverFieldExpenses',
  icon: Droplets,
  roles: ['DRIVER'],
};

export const driverMonitorItem: NavItem = {
  to: '/admin/driver-monitoring',
  labelKey: 'nav.driverMonitor',
  icon: Truck,
  roles: ['CALL_CENTER', 'OWNER', 'ACCOUNTANT'],
};

/** Dastur §4 — Owner view of the Smart Inventory report (read-only). */
export const ownerInventoryItem: NavItem = {
  to: '/owner/inventory',
  labelKey: 'nav.inventoryReport',
  icon: Warehouse,
  roles: ['OWNER'],
};

/** Dastur §4 — Accountant view of the Smart Inventory report (+ Stock-In access). */
export const accountantInventoryItem: NavItem = {
  to: '/accountant/inventory',
  labelKey: 'nav.inventoryReport',
  icon: Warehouse,
  roles: ['ACCOUNTANT', 'OWNER'],
};

/** Dastur §4 — Accountant-only Stock-In form. */
export const accountantStockInItem: NavItem = {
  to: '/accountant/stock-in',
  labelKey: 'nav.stockIn',
  icon: PackagePlus,
  roles: ['ACCOUNTANT'],
};

export const ordersItem: NavItem = {
  to: '/orders',
  labelKey: 'nav.orders',
  icon: Package,
  roles: [
    'OWNER',
    'MANAGER',
    'DRIVER',
    'CALL_CENTER',
    'ACCOUNTANT',
    'SUPERVISOR',
    'VIEWER',
  ],
};

/**
 * Dastur §2.2 — Sidebar entry for the Invoices Data hub (same route as
 * `/orders`, but surfaced to OWNER + ACCOUNTANT with a dedicated
 * "بيانات الفواتير" label so it replaces the old Dashboard quick-action
 * card). Keep `ordersItem` intact for MANAGER/DRIVER/CALL_CENTER flows.
 */
export const invoicesDataItem: NavItem = {
  to: '/orders',
  labelKey: 'nav.invoicesData',
  icon: Receipt,
  roles: ['OWNER', 'ACCOUNTANT'],
};

export const shiftsItem: NavItem = {
  to: '/shifts',
  labelKey: 'nav.shifts',
  icon: Truck,
  roles: [
    'OWNER',
    'MANAGER',
    'DRIVER',
    'SUPERVISOR',
    'ACCOUNTANT',
    'VIEWER',
  ],
};

export const financialsItem: NavItem = {
  to: '/financials',
  labelKey: 'nav.financials',
  icon: Banknote,
  roles: ['OWNER', 'MANAGER', 'ACCOUNTANT', 'SUPERVISOR', 'VIEWER'],
};

/*
 * Dastur §3 — the old "تصفية الموظفين" (collectDriverCashItem) menu item
 * and its /collect-driver-cash page were removed: driver-receipt approval
 * now happens inline on /manager/custody via a Confirm-Receipt button per
 * driver. Keeping this note so the rename/removal is discoverable.
 */

/** Dastur §3 — Manager's own pending custody bags (slip upload). */
export const myCustodyItem: NavItem = {
  to: '/manager/custody',
  labelKey: 'nav.myCustody',
  icon: Landmark,
  roles: ['MANAGER'],
};

/** Dastur §3 — Owner / Accountant aging report "Cash Held by Managers". */
export const managerCustodyAgingItem: NavItem = {
  to: '/finance/manager-custody-aging',
  labelKey: 'nav.managerCustodyAging',
  icon: ShieldAlert,
  roles: ['OWNER', 'ACCOUNTANT'],
};

/**
 * Dastur §3 — Staff Debts (internal cash liabilities). Drivers' field cash
 * + managers' pending custody in one view. Strictly excludes client debts,
 * expenses, and profit metrics.
 */
export const staffDebtsItem: NavItem = {
  to: '/staff-debts',
  labelKey: 'nav.staffDebts',
  icon: HandCoins,
  roles: ['OWNER', 'ACCOUNTANT'],
};

export const bankDepositsItem: NavItem = {
  to: '/knet-audit',
  labelKey: 'nav.knetAudit',
  icon: FileCheck2,
  roles: ['ACCOUNTANT', 'OWNER'],
};

export const knetAuditItem: NavItem = {
  to: '/knet-audit',
  labelKey: 'nav.knetAudit',
  icon: FileCheck2,
  roles: ['OWNER', 'ACCOUNTANT'],
};

export const expenseApprovalItem: NavItem = {
  to: '/expense-approval',
  labelKey: 'nav.expenseVerification',
  icon: FileCheck2,
  roles: ['ACCOUNTANT', 'OWNER'],
};

export const financialCycleReportItem: NavItem = {
  to: '/financial-cycle-report',
  labelKey: 'nav.financialCycleReport',
  icon: FileSpreadsheet,
  roles: ['OWNER'],
};

export const reportsItem: NavItem = {
  to: '/reports',
  labelKey: 'nav.reports',
  icon: FileSpreadsheet,
  roles: ['ACCOUNTANT', 'OWNER'],
};

export const financialReportsItem: NavItem = {
  to: '/reports',
  labelKey: 'nav.financialReports',
  icon: FileSpreadsheet,
  roles: ['ACCOUNTANT', 'OWNER'],
};

/**
 * Dastur §5 — Owner-only view of Call Center debt recovery performance.
 * Sourced from `/api/call-center/debt-recovery-report`.
 */
export const debtRecoveryReportItem: NavItem = {
  to: '/owner/debt-recovery',
  labelKey: 'nav.debtRecoveryReport',
  icon: LineChart,
  roles: ['OWNER'],
};

/**
 * Dastur §2.1 / §2.2 — Live driver radar / Safari Pulse (map + activity).
 * OWNER-only cockpit: surface net-profit-adjacent, real-time operational
 * signals. ACCOUNTANT and other roles MUST NOT see this entry or reach
 * the route; the `/admin/live-monitor` page enforces the same gate.
 */
export const driverAuditRadarItem: NavItem = {
  to: '/admin/live-monitor',
  labelKey: 'nav.driverAuditRadar',
  icon: Radar,
  roles: ['OWNER'],
};

/** Accountant / owner — text movement/shift logs hub (driver-centric reports). */
export const movementLogsItem: NavItem = {
  to: '/reports',
  labelKey: 'nav.movementLogs',
  icon: FileSpreadsheet,
  roles: ['ACCOUNTANT', 'OWNER'],
};

export const unifiedLedgerItem: NavItem = {
  to: '/unified-ledger',
  labelKey: 'nav.unifiedLedger',
  icon: BookText,
  roles: ['ACCOUNTANT', 'OWNER'],
};

export const expensesItem: NavItem = {
  to: '/expenses',
  labelKey: 'nav.expenses',
  icon: WalletCards,
  roles: ['MANAGER', 'OWNER'],
};

export const payrollItem: NavItem = {
  to: '/payroll',
  labelKey: 'nav.payroll',
  icon: Users,
  roles: ['OWNER'],
};

export const fixedExpensesItem: NavItem = {
  to: '/fixed-expenses',
  labelKey: 'nav.fixedExpenses',
  icon: Building2,
  roles: ['OWNER'],
};

export const teamItem: NavItem = {
  to: '/users-management',
  labelKey: 'nav.usersManagement',
  icon: Users,
  roles: ['OWNER'],
};
