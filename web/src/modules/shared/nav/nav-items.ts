import {
  Banknote,
  Building2,
  CircleDollarSign,
  ClipboardList,
  Droplets,
  FileCheck2,
  FileSpreadsheet,
  LayoutDashboard,
  ListOrdered,
  MessageCircle,
  MessageSquare,
  Package,
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
  roles: ['OWNER', 'ACCOUNTANT'],
};

export const collectionsItem: NavItem = {
  to: '/collections',
  labelKey: 'nav.customerDebtTracker',
  icon: MessageSquare,
  roles: ['OWNER', 'ACCOUNTANT'],
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
  roles: ['CALL_CENTER', 'OWNER'],
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

export const collectDriverCashItem: NavItem = {
  to: '/collect-driver-cash',
  labelKey: 'nav.staffSettlement',
  icon: CircleDollarSign,
  roles: ['MANAGER', 'OWNER'],
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
