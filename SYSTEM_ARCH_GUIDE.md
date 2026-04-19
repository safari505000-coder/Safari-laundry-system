SYSTEM_ARCH_GUIDE.md

## 1. TECHNICAL PHILOSOPHY: THE "ISLANDS" ARCHITECTURE
* **Islands Principle:** The system is divided into strictly isolated functional islands (Owner, Call Center, Driver, Manager, Accountant).
* **No Cross-Contamination:** A logic change in the Call Center module MUST NOT impact the Driver's POS or the Accountant's ledger integrity.
* **SafariStream Engine:** Real-time data sync for prices, tracking, and payment statuses across all islands.

---

## 2. ROLE-BASED UI & ACCESS CONTROL (THE DEBT TRACKING WORKSPACE)

### A. OWNER ISLAND (The Supervisor)
* **UI Mode:** READ-ONLY FINANCIAL REPORT.
* **View:** Clean tables without action buttons (WhatsApp/Payment Links).
* **Power:** Global branch filtering to re-scope all KPIs and tables instantly.

### B. CALL CENTER ISLAND (The Collector)
* **UI Mode:** ACTIVE WORKSPACE.
* **Actions:** Full visibility of WhatsApp reminder and Payment Link buttons.
* **Universal Links:** Capability to generate digital payment links for ANY debt (Cash, Knet, etc.).
* **Visual Highlight:** **YELLOW BACKGROUND** on Customer Name if a payment link is currently pending (`paymentUrl != null`).

### C. OTHER ROLES (Driver, Manager, Accountant)
* **Access:** Strictly blocked from the Debt Tracking module to prevent data leaks.

---

## 3. THE SACRED FINANCIAL KPI RULES (COLOR-CODED)

| KPI Card | Name | Strict Logic |
| :--- | :--- | :--- |
| **RED** | **Total Market Debt** | Absolute Parity: Red Card Value === Σ Visible Table Rows. |
| **GREEN** | **Collected Today** | **Debt Recovery Only:** Sum of payments where `metadata.debtSettlementViaLink === true`. Excludes regular daily sales. |
| **YELLOW** | **Pending Links** | Count of active, unpaid payment links sent by the Call Center. |

* **Reset Protocol:** All "Today" KPIs must reset at **00:00 Kuwait Local Time (UTC+3)**.

---

## 4. COLLECTION & SETTLEMENT LOGIC (CASH TO DIGITAL)
1.  **Identity Flip:** When a "CASH" debt is paid via link, `paymentMethod` must auto-switch to `ONLINE`.
2.  **Tagging:** All link settlements must be tagged in the ledger with `debtSettlementViaLink: true` for the Green Card to reflect them.
3.  **Accounting:** Automated subtraction of gateway commissions (e.g., 0.150 KWD) to maintain ledger accuracy for the Accountant.

---

## 5. TECHNICAL CONSTRAINTS & PERFORMANCE
* **Data Integrity:** Frontend visual parity must match Backend aggregate values 1:1.
* **File Limits:** Max 1MB per image/file upload to ensure field speed.
* **Timezone:** All daily windows are strictly Kuwait-Centric [00:00 - 23:59].

---
**DIRECTIVE FOR OPUS:**
"This document is the system's law. Protect the islands, maintain the financial parity, and ensure the Green Card only counts recovered debt. Do not deviate."