/** Staff-facing route hints (English). Kept in a dedicated module for size. */
export const operatorHints = {
  badge: 'For staff',
  routes: {
    dashboard:
      'Home snapshot for your role. Numbers are live; use the sidebar to drill into detail.',
    ownerDashboard:
      'Owner-focused KPI strip and shortcuts. Does not replace full finance reports for audit.',
    staffHub:
      'HR entry: attendance, payroll links, leaves, loans — scoped to what your role may open.',
    branches:
      'Maintain branch records used across POS, users, and reports. Changes affect routing and scoping.',
    manageItems:
      'Catalogue and pricing that POS and invoices read from. Publish carefully — drivers see updates.',
    knetAudit:
      'Reconcile KNET to the bank: CSV upload and/or per-invoice bank amount + ref columns in the grid.',
    ownerInventory:
      'Stock valuation / report for owner visibility. May differ from accountant cut-off timing.',
    accountantInventory:
      'Operational inventory position. Align counts with stock-in and movements before closing.',
    accountantStockIn:
      'Record goods received. Movements and COGS depend on accurate posting dates and quantities.',
    inventoryCatalog:
      'SKU master: what can be sold or consumed. Inactive items stay out of POS pickers.',
    inventoryOperations:
      'Stock-out tied to completed orders or manual issues. Affects branch availability.',
    inventoryMovements:
      'Immutable audit trail of in/out. Use filters to investigate discrepancies.',
    inventoryLowStock:
      'Reorder signals from thresholds. Confirm with physical count before purchasing.',
    purchaseOrders:
      'Procurement workflow. Receipt step feeds stock-in; do not double-post the same goods.',
    customers:
      'Call-center customer search and quick actions. Respect privacy — logs may be audited.',
    collections:
      'Market debt KPIs and follow-up tools. Red totals are UNPAID orders in scope, not GL profit.',
    myDeposits:
      'Your bank deposit requests and status. Upload clear slips; amounts must match batch totals.',
    whatsappTools:
      'Outbound templates and links (e.g. payment, statement). Sends are attributed to your user.',
    myDailySales:
      'Your completed sales and cash position. Pending settlement rows still count as your custody.',
    myCashReceipts:
      'Signed cash receipt vouchers you issued. Print keeps the same legal wording as issued.',
    myFieldExpenses:
      'Submit field expenses with photos. Approval queues are separate from vehicle fuel if any.',
    driverPendingInvoices:
      'Invoices still open on you after ledger rules. When in doubt, compare with «Receivables».',
    driverMonitoring:
      'Live map/list of drivers on shift. GPS may fallback to branch when location is stale.',
    liveMonitor:
      'Operations pulse: branches, drivers, money tiles. For triage — not a substitute for ledger drill-down.',
    subscriptions:
      'Plans catalogue (prices and credit). Activations happen from Subscribers, not here.',
    subscribers:
      'Live subscription state and wallet. Remaining balance uses +/−; renewals and debt tools live here.',
    orders:
      'Invoice list for your permission scope. Drivers only see their own tickets.',
    invoicePrint:
      'Printable invoice image for the customer. Same layout as WhatsApp/public link when enabled.',
    invoicesBrowse:
      'Cross-branch invoice browser with search. Supervisor edits are audit-logged.',
    shifts:
      'Driver shift open/close times. Open shift age feeds «late» signals on custody reports.',
    managerCustody:
      'Cash bags received from drivers. Next step is deposit slip and accountant verification.',
    managerDocuments:
      'Your submitted expenses and vouchers. Track approval state before calling finance.',
    feedbackInbox:
      'Customer star ratings from invoice QR. «Acknowledged» is internal only — not sent to customer.',
    driverOversight:
      'Manager view of fleet activity. Use alongside Driver Monitoring for exceptions.',
    managerCustodyAging:
      'How long custody has waited per stage. Escalate stuck AWAITING_VERIFICATION rows.',
    staffDebts:
      'Live pipeline: all methods still PAID_TO_DRIVER plus managers’ pending custody. Not the same as «Driver cash trace» (date + CASH only).',
    ownerSerials:
      'Invoice serial counters per operator. Changing keys impacts new invoice numbers only.',
    debtRecovery:
      'Recovery analytics on receivables. Tie back to «Receivables» for open invoice lines.',
    financials:
      'Executive finance island: profit, fees, debts. Align date range with month close policy.',
    moneyFlowStatement:
      'Period inflows, deductions, and outflows with ledger rollups. Overlaps with P&L by design — use for audit trails.',
    monthlySummary:
      'Branch P&L style month close. Print view omits shell chrome for clean PDFs.',
    insightsAi:
      'AI-generated commentary on exported metrics. Verify figures against source reports.',
    debtTransfers:
      'Office workflow to reassign driver cash liability. Drivers sign on «My debt transfers».',
    myDebtTransfers:
      'Documents waiting for your signature. Read totals before confirming — binding transfer.',
    attendance:
      'Clock-in/out and roster visibility per HR policy. Retro edits may need supervisor rights.',
    expenseApproval:
      'Approve or reject submitted expenses with receipt photos. Rejection reason is visible to submitter.',
    vehicleExpensesMine:
      'Your fleet-related claims (fuel/service). Separate approval queue from general expenses.',
    vehicleExpensesApproval:
      'Fleet expense queue. Match plate, date, and receipt before approval.',
    vehicleExpensesReport:
      'Aggregated vehicle spend. Use for reimbursement cycles, not customer billing.',
    financialCycleReport:
      'End-to-end cash cycle narrative for the period. Cross-check with unified ledger entries.',
    driverCashTrace:
      'Date-window CASH collections and custody bags by receive time. «Cash pipeline» is a live all-methods snapshot — totals differ by design.',
    cashReconciliation:
      'Side-by-side: money collected vs handed in the window, versus who still holds cash today (drivers vs managers by bag status).',
    accountantDashboard:
      'Period KPIs, live cash pipeline, reconciliation diff with explain breakdown, alerts, and GL-based insights. Data is server-cached ~45s.',
    unpaidInvoices:
      'Customer receivable lines with issuer column. Market KPI uses UNPAID orders; FIFO reduces remaining.',
    reports:
      'Classic report launcher. Prefer «Reports hub» if your role lands there by default.',
    reportsHub:
      'Core finance only: P&L, cycle, KNET, unified ledger. Operational reports live under Operations & insights.',
    operationalReportsHub:
      'Invoice/cash operational reports and AI insights. Each tab enforces its own permissions and date rules.',
    unifiedLedger:
      'Append-only financial event stream. Filters help audit; exports for accountants.',
    payroll:
      'Payroll batches and roster print. Payslip print opens in a new tab without sidebar.',
    systemSettings:
      'Danger zone for admins: users, roles, toggles. Double-check branch before saving.',
    commissionRules:
      'Commission rule definitions. Payout runs use rules active at earning time.',
    commissionPayouts:
      'Generated payouts from collections/sales rules. Reconcile with debt ledger PAYMENT rows.',
    debtHolds:
      'Temporary blocks on collection/commission until cleared. Do not confuse with customer debt.',
    fixedExpenses:
      'Scheduled recurring costs. Missed accruals skew monthly summary.',
    expenses:
      'General expense ledger. Status filters separate draft, pending, and posted.',
    ccPerformance:
      'Call-center productivity metrics. Scoped to CC roles and date picker.',
    invoiceAudit:
      'Supervisor invoice edits and voids. Pair with printable invoice for customer disputes.',
    posDriver:
      'Field checkout: confirm customer, method, and totals before complete — you are accountable for the ticket.',
    posManager:
      'Back-office POS on behalf of branch. Same posting rules as field; watch branch context.',
    myCashReceiptsPrint:
      'Voucher for an issued receipt. Give customer copy only after amount matches the system.',
    expenseVoucherPrint:
      'Manager expense voucher. Keep paper aligned with approval reference.',
    payslipPrint:
      'Employee payslip — confidential. Close tab after printing or saving PDF.',
    payrollRosterPrint:
      'Monthly roster for signatures. Verify names and net pay before distribution.',
    attendancePrint:
      'Attendance sheet for the selected window. HR archive — not for customer use.',
    leavePrint:
      'Leave request hard copy. Status on screen is authoritative if paper is stale.',
    loanPrint:
      'Loan agreement / schedule printout. Legal fields come from HR master data.',
    statementPrint:
      'Customer statement for filing or handover. Same numbers as ledger for that customer at generation time.',
    monthlySummaryPrint:
      'Month-close printable pack. Prefer landscape and disable headers/footers in browser print.',
  },
} as const;
