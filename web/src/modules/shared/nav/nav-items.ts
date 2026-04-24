import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  BrainCircuit,
  Briefcase,
  Clock,
  CalendarRange,
  FileSignature,
  BookText,
  Building2,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Hash,
  History,
  CirclePlus,
  FileCheck2,
  ClipboardCheck,
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
  ReceiptText,
  Settings,
  ShieldAlert,
  Warehouse,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  WalletCards,
  Car,
  Fuel,
  Wrench,
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
  roles: ['OWNER', 'GENERAL_MANAGER'],
};

export const ownerDashboardItem: NavItem = {
  to: '/financials',
  labelKey: 'nav.ownerDashboard',
  icon: LayoutDashboard,
  roles: ['OWNER', 'GENERAL_MANAGER'],
};

export const myDepositsItem: NavItem = {
  to: '/my-deposits',
  labelKey: 'nav.myDeposits',
  icon: CircleDollarSign,
  roles: ['DRIVER'],
};

/**
 * V19.17 — Driver's "سندات الاستلام" list (every formal cash-handover
 * voucher a branch manager has issued to them). Sits next to the
 * live custody page so the driver can always jump from "what I still
 * owe" to "what I've already handed over and been credited for".
 */
export const myCashReceiptsItem: NavItem = {
  to: '/my-cash-receipts',
  labelKey: 'nav.myCashReceipts',
  icon: ReceiptText,
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
    'GENERAL_MANAGER',
    'MANAGER',
    'DRIVER',
    'CALL_CENTER',
    'CALL_CENTER_SUPERVISOR',
    'ACCOUNTANT',
    'SUPERVISOR',
    'VIEWER',
  ],
};

// V19.4 — CC cleanup. `/subscriptions` is now the plan-catalog page for
// executives only. CALL_CENTER was removed from the role list so the
// nav never surfaces this link to agents (they use `/subscribers`).
export const subscriptionsItem: NavItem = {
  to: '/subscriptions',
  labelKey: 'nav.subscriptions',
  icon: Sparkles,
  roles: ['OWNER', 'GENERAL_MANAGER'],
};

export const subscribersItem: NavItem = {
  to: '/subscribers',
  labelKey: 'nav.subscribers',
  icon: ListOrdered,
  roles: ['OWNER', 'GENERAL_MANAGER', 'CALL_CENTER', 'CALL_CENTER_SUPERVISOR'],
};

export const customersItem: NavItem = {
  to: '/customers',
  labelKey: 'nav.customers',
  icon: Users,
  // Dastur §5 — CALL_CENTER + CC supervisor are the CRM island.
  // Owner + GM keep full access.
  roles: ['OWNER', 'GENERAL_MANAGER', 'CALL_CENTER', 'CALL_CENTER_SUPERVISOR'],
};

export const collectionsItem: NavItem = {
  to: '/collections',
  labelKey: 'nav.customerDebtTracker',
  icon: MessageSquare,
  // Dastur §5 — Tahseel (debt recovery) is a CALL_CENTER core surface.
  // The supervisor mirrors the same access (and then some).
  roles: ['OWNER', 'GENERAL_MANAGER', 'CALL_CENTER', 'CALL_CENTER_SUPERVISOR'],
};

/**
 * V19.22 — Customer QR feedback inbox. Lives next to the Call-Center
 * collections item because the team that follows up on complaints is
 * the same team. Owner + GM see it as a strategic signal.
 */
export const feedbackInboxItem: NavItem = {
  to: '/feedback',
  labelKey: 'nav.feedbackInbox',
  icon: MessageSquare,
  roles: ['OWNER', 'GENERAL_MANAGER', 'CALL_CENTER', 'CALL_CENTER_SUPERVISOR'],
};

export const whatsappToolsItem: NavItem = {
  to: '/whatsapp-tools',
  labelKey: 'nav.whatsappTools',
  icon: MessageCircle,
  roles: ['OWNER', 'GENERAL_MANAGER', 'CALL_CENTER', 'CALL_CENTER_SUPERVISOR'],
};

/** DRIVER — تسجيل وقود/تكاليف ميدان (نفس المسار؛ الأيقونة + التسمية للقائمة الرئيسية). */
export const driverFieldExpensesItem: NavItem = {
  to: '/my-field-expenses',
  labelKey: 'nav.driverFieldExpenses',
  icon: CirclePlus,
  roles: ['DRIVER'],
};

/**
 * V3.8 — Driver island "Field Collection Tracker" (كشف المتابعة
 * الميدانية). READ-ONLY list of the driver's own unpaid invoices.
 * Deliberately DRIVER-only: Call Center / Owner view the same data
 * (and more) through the Collections island; leaking this entry to
 * other roles would duplicate the sidebar surface.
 */
export const driverPendingInvoicesItem: NavItem = {
  to: '/driver/pending-invoices',
  labelKey: 'nav.driverPendingInvoices',
  icon: ClipboardCheck,
  roles: ['DRIVER'],
};

export const driverMonitorItem: NavItem = {
  to: '/admin/driver-monitoring',
  labelKey: 'nav.driverMonitor',
  icon: Truck,
  // V19.14 — visible to the executive pair + Call Center so the
  // driver map returns to their sidebars. Live data still flows only
  // for OWNER until the dedicated CC/GM endpoint is wired; see the
  // comment on `driverMonitor.view` in access-matrix.ts.
  roles: ['OWNER', 'GENERAL_MANAGER', 'CALL_CENTER', 'CALL_CENTER_SUPERVISOR'],
};

/** Dastur §4 — Owner / GM view of the Smart Inventory report (read-only). */
export const ownerInventoryItem: NavItem = {
  to: '/owner/inventory',
  labelKey: 'nav.inventoryReport',
  icon: Warehouse,
  roles: ['OWNER', 'GENERAL_MANAGER'],
};

/** Dastur §4 — Accountant view of the Smart Inventory report (+ Stock-In access). */
export const accountantInventoryItem: NavItem = {
  to: '/accountant/inventory',
  labelKey: 'nav.inventoryReport',
  icon: Warehouse,
  roles: ['ACCOUNTANT', 'OWNER', 'GENERAL_MANAGER'],
};

/** Dastur §4 — Accountant-only Stock-In form. */
export const accountantStockInItem: NavItem = {
  to: '/accountant/stock-in',
  labelKey: 'nav.stockIn',
  icon: PackagePlus,
  roles: ['ACCOUNTANT'],
};

/** Stage-E — inventory catalog maintenance (items, categories, suppliers). */
export const inventoryCatalogItem: NavItem = {
  to: '/inventory/catalog',
  labelKey: 'nav.inventoryCatalog',
  icon: Settings,
  roles: ['OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT'],
};

/** Stage-E — stock-out / adjustment / transfer / stocktake workbench. */
export const inventoryOperationsItem: NavItem = {
  to: '/inventory/operations',
  labelKey: 'nav.inventoryOperations',
  icon: ArrowLeftRight,
  roles: ['ACCOUNTANT', 'MANAGER'],
};

/** Stage-E — full stock movements audit log. */
export const inventoryMovementsItem: NavItem = {
  to: '/inventory/movements',
  labelKey: 'nav.inventoryMovements',
  icon: History,
  roles: ['OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT'],
};

/** Stage-E — live low-stock/out-of-stock list. */
export const inventoryLowStockItem: NavItem = {
  to: '/inventory/low-stock',
  labelKey: 'nav.inventoryLowStock',
  icon: AlertTriangle,
  roles: ['OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT'],
};

/** Stage-F Cosmetic — Purchase Orders (supplier → PO → receive). */
export const purchaseOrdersItem: NavItem = {
  to: '/purchase-orders',
  labelKey: 'nav.purchaseOrders',
  icon: FileText,
  roles: ['OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT', 'MANAGER'],
};

export const ordersItem: NavItem = {
  to: '/orders',
  labelKey: 'nav.orders',
  icon: Package,
  roles: [
    'OWNER',
    'GENERAL_MANAGER',
    'MANAGER',
    'DRIVER',
    'CALL_CENTER',
    'CALL_CENTER_SUPERVISOR',
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
  roles: ['OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT'],
};

/**
 * V19.9 — CC Supervisor pack. Performance leaderboard per CC agent
 * (collections, debt settled, activations, distinct customers). Also
 * exposed to OWNER + GENERAL_MANAGER because they audit the team.
 */
export const ccPerformanceItem: NavItem = {
  to: '/cc-performance',
  labelKey: 'nav.ccPerformance',
  icon: LineChart,
  roles: ['OWNER', 'GENERAL_MANAGER', 'CALL_CENTER_SUPERVISOR'],
};

/**
 * V19.9 — Invoice audit trail. Owner + GM + Accountant consume this
 * read-only report of every supervisor-initiated edit / void with
 * before/after snapshots and reason text.
 */
export const invoiceAuditItem: NavItem = {
  to: '/invoice-audit',
  labelKey: 'nav.invoiceAudit',
  icon: FileSignature,
  roles: ['OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT'],
};

/**
 * V19.9 — "كل الفواتير" unified invoice browser.
 *
 * A phone-first search over every issued invoice with issuer, branch,
 * status, and the printable invoice image. Shared by CC agents,
 * supervisors, and accountants so all three have a single surface for
 * "pull up a customer's history" instead of hopping between Customer
 * 360 and the operations Orders page.
 */
export const allInvoicesItem: NavItem = {
  to: '/invoices',
  labelKey: 'nav.allInvoices',
  icon: FileText,
  roles: [
    'OWNER',
    'GENERAL_MANAGER',
    'CALL_CENTER',
    'CALL_CENTER_SUPERVISOR',
    'ACCOUNTANT',
  ],
};

export const shiftsItem: NavItem = {
  to: '/shifts',
  labelKey: 'nav.shifts',
  icon: Truck,
  roles: [
    'OWNER',
    'GENERAL_MANAGER',
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
  roles: ['OWNER', 'GENERAL_MANAGER'],
};

/**
 * V19.13 — "الملخص الشهري" (Monthly Summary).
 *
 * A single page that rolls up the whole P&L for a chosen period:
 * one consolidated block covering all branches + a per-branch card
 * for each active branch. OWNER + GENERAL_MANAGER only — this is an
 * executive oversight surface, not a day-to-day accountant tool.
 */
export const monthlySummaryItem: NavItem = {
  to: '/monthly-summary',
  labelKey: 'nav.monthlySummary',
  icon: CalendarRange,
  roles: ['OWNER', 'GENERAL_MANAGER'],
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

/**
 * V19.22.5 — Branch Manager "My Documents" island. Unified inbox for
 * every Accountant-approved document (custody receipts + expense
 * vouchers) with per-row print buttons.
 */
export const myDocumentsItem: NavItem = {
  to: '/manager/my-documents',
  labelKey: 'nav.myDocuments',
  icon: FileCheck2,
  roles: ['MANAGER'],
};

/**
 * V19.22.5 — Branch Manager "Driver Oversight" island. Colourful
 * card list of the branch's drivers with today's performance and
 * risk flags; the map view lives on /admin/driver-monitoring and is
 * shared with CC + CC Supervisor.
 */
export const driverOversightItem: NavItem = {
  to: '/manager/driver-oversight',
  labelKey: 'nav.driverOversight',
  icon: Radar,
  roles: ['MANAGER'],
};

/** Dastur §3 — Owner / Accountant aging report "Cash Held by Managers". */
export const managerCustodyAgingItem: NavItem = {
  to: '/finance/manager-custody-aging',
  labelKey: 'nav.managerCustodyAging',
  icon: ShieldAlert,
  roles: ['OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT'],
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
  roles: ['OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT'],
};

/**
 * Dastur V1.5.4 — the ACCOUNTANT's K-Net reconciliation workbench.
 * Full tool: CSV upload, load orders, reconcile the bank export against
 * issued K-Net invoices. OWNER must NOT reach this entry — they get the
 * read-only `knetAuditReportItem` below instead.
 */
export const knetAuditItem: NavItem = {
  to: '/knet-audit',
  labelKey: 'nav.knetAudit',
  icon: FileCheck2,
  roles: ['ACCOUNTANT'],
};

/**
 * Dastur V1.5.4 — OWNER-only read-only view of the same K-Net audit page.
 * Same route, but the page itself suppresses the CSV upload and any
 * reconciliation actions when the current user lacks ACCOUNTANT. The
 * sidebar label is "KNET Audit Report" to reflect its finished-report role.
 */
export const knetAuditReportItem: NavItem = {
  to: '/knet-audit',
  labelKey: 'nav.knetAuditReport',
  icon: FileSpreadsheet,
  roles: ['OWNER', 'GENERAL_MANAGER'],
};

export const expenseApprovalItem: NavItem = {
  to: '/expense-approval',
  labelKey: 'nav.expenseVerification',
  icon: FileCheck2,
  roles: ['ACCOUNTANT', 'OWNER', 'GENERAL_MANAGER'],
};

/**
 * V19.10 — Fleet Supervisor (مسؤول السيارات). Three surfaces:
 *   • `vehicleExpensesMineItem`      — submit + own history (supervisor).
 *   • `vehicleExpensesApprovalItem`  — accountant queue (approve/reject).
 *   • `vehicleExpensesReportItem`    — owner + accountant report (aggregates).
 */
export const vehicleExpensesMineItem: NavItem = {
  to: '/vehicle-expenses',
  labelKey: 'nav.vehicleExpenses',
  icon: Car,
  roles: ['FLEET_SUPERVISOR'],
};

export const vehicleExpensesApprovalItem: NavItem = {
  to: '/vehicle-expenses/approval',
  labelKey: 'nav.vehicleExpensesApproval',
  icon: Wrench,
  roles: ['ACCOUNTANT', 'OWNER', 'GENERAL_MANAGER'],
};

export const vehicleExpensesReportItem: NavItem = {
  to: '/vehicle-expenses/report',
  labelKey: 'nav.vehicleExpensesReport',
  icon: Fuel,
  roles: ['OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT'],
};

export const financialCycleReportItem: NavItem = {
  to: '/financial-cycle-report',
  labelKey: 'nav.financialCycleReport',
  icon: FileSpreadsheet,
  roles: ['OWNER', 'GENERAL_MANAGER'],
};

export const driverCashTraceItem: NavItem = {
  to: '/driver-cash-trace',
  labelKey: 'nav.driverCashTrace',
  icon: Truck,
  roles: ['OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT'],
};

// V19.10 — "قائمة مديونيات الفواتير". Every invoice that still carries
// outstanding customer debt, with filters + a printable statement.
export const unpaidInvoicesItem: NavItem = {
  to: '/unpaid-invoices',
  labelKey: 'nav.unpaidInvoices',
  icon: FileSignature,
  roles: [
    'OWNER',
    'GENERAL_MANAGER',
    'ACCOUNTANT',
    'CALL_CENTER',
    'CALL_CENTER_SUPERVISOR',
  ],
};

export const reportsItem: NavItem = {
  to: '/reports',
  labelKey: 'nav.reports',
  icon: FileSpreadsheet,
  roles: ['ACCOUNTANT', 'OWNER', 'GENERAL_MANAGER'],
};

export const financialReportsItem: NavItem = {
  to: '/reports',
  labelKey: 'nav.financialReports',
  icon: FileSpreadsheet,
  roles: ['ACCOUNTANT', 'OWNER', 'GENERAL_MANAGER'],
};

/**
 * V19.9.7 — Unified "Financial reports" hub entry for OWNER / GM.
 *
 * Replaces six separate finance entries (P&L, operational reports,
 * financial cycle, KNET audit, unified ledger, AI insights) with a
 * single hub that nests them as internal tabs. The underlying routes
 * remain registered so deep links keep working.
 */
export const financialReportsHubItem: NavItem = {
  to: '/reports-hub',
  labelKey: 'nav.financialReports',
  icon: FileSpreadsheet,
  roles: ['OWNER', 'GENERAL_MANAGER'],
};

/**
 * Dastur §1 (V1.5) — Owner-only Serial Management island: assign
 * single-letter driver prefixes and view the live global serial log.
 */
export const ownerSerialsItem: NavItem = {
  to: '/owner/serials',
  labelKey: 'nav.ownerSerials',
  icon: Hash,
  roles: ['OWNER', 'GENERAL_MANAGER'],
};

/**
 * Dastur §5 — Owner-only view of Call Center debt recovery performance.
 * Sourced from `/api/call-center/debt-recovery-report`.
 */
export const debtRecoveryReportItem: NavItem = {
  to: '/owner/debt-recovery',
  labelKey: 'nav.debtRecoveryReport',
  icon: LineChart,
  roles: ['OWNER', 'GENERAL_MANAGER'],
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

export const unifiedLedgerItem: NavItem = {
  to: '/unified-ledger',
  labelKey: 'nav.unifiedLedger',
  icon: BookText,
  roles: ['ACCOUNTANT', 'OWNER', 'GENERAL_MANAGER'],
};

/**
 * Dastur §5 — Debt Transfer document hub.
 *
 * GM / ACCOUNTANT operate the full workflow; OWNER reads the history
 * and filters only (enforced on the page itself via `debtTransfer.*`
 * keys — the sidebar entry just opens the page).
 */
export const debtTransfersItem: NavItem = {
  to: '/finance/debt-transfers',
  labelKey: 'nav.debtTransfers',
  icon: ArrowLeftRight,
  roles: ['OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT'],
};

/** Driver inbox: transfers awaiting my signature (source or target). */
export const myDebtTransfersItem: NavItem = {
  to: '/my/debt-transfers',
  labelKey: 'nav.debtTransfers',
  icon: FileSignature,
  roles: ['DRIVER'],
};

export const expensesItem: NavItem = {
  to: '/expenses',
  labelKey: 'nav.expenses',
  icon: WalletCards,
  roles: ['MANAGER', 'OWNER', 'GENERAL_MANAGER'],
};

export const payrollItem: NavItem = {
  to: '/payroll',
  labelKey: 'nav.payroll',
  icon: Users,
  roles: ['OWNER', 'GENERAL_MANAGER'],
};

// V19.16 — Settings dashboard + commission / debt-hold surfaces.
export const systemSettingsItem: NavItem = {
  to: '/settings/dashboard',
  labelKey: 'nav.systemSettings',
  icon: Settings,
  roles: ['OWNER', 'GENERAL_MANAGER'],
};

export const commissionRulesItem: NavItem = {
  to: '/settings/commission-rules',
  labelKey: 'nav.commissionRules',
  icon: HandCoins,
  roles: ['OWNER', 'GENERAL_MANAGER'],
};

export const commissionPayoutsItem: NavItem = {
  to: '/commission-payouts',
  labelKey: 'nav.commissionPayouts',
  icon: CircleDollarSign,
  roles: ['OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT', 'MANAGER'],
};

export const debtHoldsItem: NavItem = {
  to: '/debt-holds',
  labelKey: 'nav.debtHolds',
  icon: ShieldAlert,
  roles: ['OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT', 'MANAGER'],
};

/**
 * Stage-D — attendance. Shared across the exec pair + branch MANAGER
 * (branch HR) + ACCOUNTANT (payroll sign-off). Access-matrix enforces
 * the same set via `attendance.view`.
 */
export const attendanceItem: NavItem = {
  to: '/attendance',
  labelKey: 'nav.attendance',
  icon: Clock,
  roles: ['OWNER', 'GENERAL_MANAGER', 'MANAGER', 'ACCOUNTANT'],
};

/*
 * V19.9.5 — `leavesItem` and `loansItem` (HR self-service) were
 * removed from the sidebar taxonomy per owner directive. The
 * pages (/leaves, /loans) and their backend endpoints stay live
 * and remain reachable by direct URL so any in-flight HR records
 * can still be viewed / closed out. When the HR roadmap is frozen
 * we can delete the routes + pages entirely (see Phase 4 of the
 * sidebar-refresh plan).
 */

export const fixedExpensesItem: NavItem = {
  to: '/fixed-expenses',
  labelKey: 'nav.fixedExpenses',
  icon: Building2,
  roles: ['OWNER', 'GENERAL_MANAGER'],
};

export const teamItem: NavItem = {
  to: '/owner-dashboard',
  labelKey: 'nav.usersManagement',
  icon: Users,
  roles: ['OWNER', 'GENERAL_MANAGER'],
};

/**
 * V19.17 — "Staff Affairs" hub. Standalone page distinct from
 * `teamItem` (which handles user accounts + branch registry). This
 * hub bundles the operational HR surfaces (payroll, attendance,
 * commission payouts, debt holds, commission rules, system settings)
 * behind internal tabs with a print button that prints the currently
 * active tab.
 */
export const staffHubItem: NavItem = {
  to: '/staff-hub',
  labelKey: 'nav.staffHub',
  icon: Briefcase,
  roles: ['OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT', 'MANAGER'],
};

/**
 * V19.0 — Branch management: OWNER + GENERAL_MANAGER (second-eye). Matches the
 * backend guard on POST /api/branches which now accepts both roles.
 */
export const branchesItem: NavItem = {
  to: '/branches',
  labelKey: 'nav.branches',
  icon: Building2,
  roles: ['OWNER', 'GENERAL_MANAGER'],
};

/**
 * Stage-C — AI / BI insights dashboard. OWNER/GM see everything
 * (including the executive weekly PDF archive); ACCOUNTANT reaches the
 * financial tabs (cash forecast + anomalies); MANAGER reaches the
 * driver scorecard tab. The page itself hides tabs based on
 * `access-matrix.ts`, so every role sees only what it can consume.
 */
export const insightsAiItem: NavItem = {
  to: '/insights/ai',
  labelKey: 'nav.insightsAi',
  icon: BrainCircuit,
  roles: ['OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT', 'MANAGER'],
};
