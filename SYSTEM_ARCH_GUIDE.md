SYSTEM_ARCH_GUIDE.md

## 1. Technical Philosophy & Architecture
* **Islands Architecture:** Strictly isolate UI modules in `/pages/owner`, `/pages/driver`, `/pages/accountant`, etc.
* **SafariStream:** Real-time data pipeline for prices, stock levels, and live tracking.
* **Data Integrity:** No "Ghost" records. Every financial move must hit the `GeneralLedgerEntry`.
* **Constraints:** JSON body limit strictly **1MB** to support Base64 receipt uploads.

## 2. Role-Based Access Control (RBAC) Matrix

### 🔴 OWNER (The Sovereign)
* **Full Authority:** Only role allowed to modify the Master Price List (Units & Names).
* **Strategic Oversight:** Access to **Net Profit**, Audit Logs, and full Financial Dashboards.
* **Live Operations:** Real-time **Driver Tracking**, monitoring **Driver Shifts**, and Managing **Subscribers List**.
* **Smart Inventory:** Access to advanced inventory analytics with smart filtering.

### 🟣 ACCOUNTANT (Financial Auditor & Inventory Controller)
* **Stock Management:** Authorized to **Add Stock (Stock-In)**, recording quantities, purchase costs, and suppliers.
* **Operational Audit:** Access to **Live Driver Tracking** and **Shift Logs** to verify fuel expenses and payroll.
* **Bank Reconciliation:** Upload bank statements -> Auto-match K-Net/Link transactions -> Deduct commissions.
* **Expense Guard:** Approve expenses (Fuel/Maintenance) only with valid photo attachments.
* **Privacy Wall:** Blocked from viewing Net Profits or Customer Personal contact data.

### 🟡 CALL CENTER (Customer Success & Operations)
* **Customer Care:** Access to customer profiles and the **Subscribers List** for service renewal.
* **Live Dispatch:** Monitor **Live Driver Tracking** and **Shift Status** (Who is currently on-shift?) to assign orders.
* **Privacy Wall:** Blocked from all financial data (Costs, Profits, Salaries).

### 🔵 BRANCH MANAGER (Local Operations)
* **Stock Control:** Handle inter-branch transfers and monitor local stock levels.
* **Yellow Alerts:** Receive notifications for low stock levels.
* **Restricted:** No price editing or high-level financial access.

### 🟢 DRIVER (The Field Force)
* **Strict Invoicing:** Issue invoices only at prices set by the Owner.
* **Shift Management:** Start/End shifts with Odometer recording.
* **Offline Resilience:** Draft invoices in low-signal areas and sync later.

## 3. Financial & Automation Laws
* **Link Commission:** Automatically deduct **150 fils** per Link-paid invoice.
* **K-Net Fees:** Auto-calculate bank fees during reconciliation as bank expenses.
* **Unified Ledger:** All transactions must flow through the accounting core.

## 4. Smart Inventory & Subscribers Logic
* **Smart Filtering:** Inventory reports must support multi-layer filtering (Category + Branch + Date + Stock Status).
* **Stock Colors:** Visual cues: **Yellow** (Low Stock), **Red** (Out of Stock).
* **Subscriber Management:** Centralized tracking of subscriptions, start/end dates, and payment status.

## 5. UI/UX Standards
* **Decoupled Logic:** Use shared hooks (e.g., `use-price-list.ts`) but keep the UI views strictly separated by folder.
* **Mobile First:** All Driver and Call Center tracking views must be optimized for speed.