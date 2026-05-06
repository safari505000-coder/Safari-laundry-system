-- =============================================================================
-- Safari ERP — Go-live financial reset (PostgreSQL)
-- =============================================================================
-- PURPOSE: Remove trial operational/financial data while KEEPING:
--   • Laundry catalog: "LaundryItemCategory", "LaundryPriceListItem", "LaundryBranchItemPrice"
--   • "SubscriptionPlan" (plan catalogue)
--   • "User", "Branch", "Role", "Customer" master rows (phones/names — not deleted)
--   • Inventory master: "StockItem", "InventoryCategory", "Supplier" (optional stock qty — see bottom)
--   • "PaymentMethodFeeConfig", "DebtHoldPolicy", "PayrollSettings", "SystemToggle"
--
-- RUNS: Customer wallet + branch wallet balances → 0; clears "SerialCounter" (next invoice سند A-1…)
--
-- ⚠️  MANDATORY BEFORE RUN — full backup, e.g.:
--   (Unix) pg_dump "$DATABASE_URL" -Fc -f safari_erp_backup_$(date +%Y%m%d_%H%M).dump
--   (Windows PowerShell) pg_dump $env:DATABASE_URL -Fc -f "safari_erp_backup.dump"
--   Or your host’s equivalent (RDS snapshot, etc.)
--
-- EXECUTION (example):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/go-live-reset-financial.sql
--   (Windows) psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f scripts/go-live-reset-financial.sql
--
-- OFFLINE QUEUE (browser IndexedDB): not in this database. After deploy, each POS device:
--   DevTools → Application → IndexedDB → safari-erp-offline-v1 → Delete database
--   (or ask staff to clear site data for the app origin once.)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Commission & payroll-linked rows (order before Payroll)
-- ---------------------------------------------------------------------------
DELETE FROM "CommissionPayout";

DELETE FROM "DebtHold";

-- ---------------------------------------------------------------------------
-- 2) Debt ledger (self-FK on refEntryId)
-- ---------------------------------------------------------------------------
UPDATE "DebtLedgerEntry" SET "refEntryId" = NULL WHERE "refEntryId" IS NOT NULL;
DELETE FROM "DebtLedgerEntry";

-- ---------------------------------------------------------------------------
-- 3) Customer ledger history (no longer references orders after nulling where needed)
-- ---------------------------------------------------------------------------
DELETE FROM "TransactionHistory";

-- ---------------------------------------------------------------------------
-- 3b) Double-entry journal rows. Keep "Account" chart of accounts.
--     Conditional because older deployments may not have the journal migration yet.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public."JournalLine"') IS NOT NULL THEN
    ALTER TABLE "JournalLine" DISABLE TRIGGER USER;
    DELETE FROM "JournalLine";
    ALTER TABLE "JournalLine" ENABLE TRIGGER USER;
  END IF;
  IF to_regclass('public."JournalEntry"') IS NOT NULL THEN
    ALTER TABLE "JournalEntry" DISABLE TRIGGER USER;
    DELETE FROM "JournalEntry";
    ALTER TABLE "JournalEntry" ENABLE TRIGGER USER;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Orders — children first where FK is RESTRICT
-- ---------------------------------------------------------------------------
DELETE FROM "InvoiceAuditLog";
DELETE FROM "OrderFeedback";
DELETE FROM "OrderLineItem";

DELETE FROM "DebtTransferOrder";
DELETE FROM "DebtTransfer";

-- Call-center dispatch work is operational launch data, not master data.
DELETE FROM "Dispatch";
DELETE FROM "DriverMetrics";

-- ---------------------------------------------------------------------------
-- 5) Cash custody / driver deposits (Shift rows deleted in step 9 after Orders)
-- ---------------------------------------------------------------------------
DELETE FROM "BankDepositLog";
DELETE FROM "ManagerCashCustody";
DELETE FROM "Deposit";

-- ---------------------------------------------------------------------------
-- 6) General ledger (expense / order / customer refs)
-- ---------------------------------------------------------------------------
DELETE FROM "GeneralLedgerEntry";

-- ---------------------------------------------------------------------------
-- 7) Orders & POS bundles
-- ---------------------------------------------------------------------------
DELETE FROM "Order";
DELETE FROM "PosPaymentBundle";

-- ---------------------------------------------------------------------------
-- 8) Subscription *instances* (history). Plan catalogue ("SubscriptionPlan") stays intact.
--     Break linear chain FK before bulk delete.
-- ---------------------------------------------------------------------------
UPDATE "CustomerSubscription" SET "parentSubscriptionId" = NULL WHERE "parentSubscriptionId" IS NOT NULL;
DELETE FROM "CustomerSubscription";

-- ---------------------------------------------------------------------------
-- 9) Shifts (no remaining Order.handoverShiftId rows)
-- ---------------------------------------------------------------------------
DELETE FROM "Shift";

-- ---------------------------------------------------------------------------
-- 10) HR / payroll trial data (optional for pure POS reset — safe to keep if you only use HR later)
-- ---------------------------------------------------------------------------
DELETE FROM "PayrollAdHocLine";
DELETE FROM "Payroll";
DELETE FROM "EmployeeLoan";

DELETE FROM "AttendanceLog";
DELETE FROM "LeaveRequest";

-- ---------------------------------------------------------------------------
-- 11) Expenses (trial branch & fleet receipts)
-- ---------------------------------------------------------------------------
DELETE FROM "BranchExpense";
DELETE FROM "VehicleExpense";

-- ---------------------------------------------------------------------------
-- 12) Procurement (optional — remove if trial PO/receipt rows must vanish)
-- ---------------------------------------------------------------------------
UPDATE "PurchaseOrderReceiptLine" SET "stockMovementId" = NULL WHERE "stockMovementId" IS NOT NULL;
DELETE FROM "StockMovement";

DELETE FROM "PurchaseOrderReceiptLine";
DELETE FROM "PurchaseOrderReceipt";
DELETE FROM "PurchaseOrderLine";
DELETE FROM "PurchaseOrder";

-- ---------------------------------------------------------------------------
-- 13) Audit log (operations trail — uncomment if you want a clean slate)
-- ---------------------------------------------------------------------------
-- DELETE FROM "AuditLog";

-- ---------------------------------------------------------------------------
-- 14) Reset customer wallets (balances + subscription snapshot fields on wallet row)
-- ---------------------------------------------------------------------------
UPDATE "CustomerWallet"
SET
  "balance" = 0,
  "debt" = 0,
  "subscriptionActivatedAt" = NULL,
  "subscriptionExpiresAt" = NULL,
  "subscriptionPlanId" = NULL,
  "subscriptionPlanName" = NULL,
  "subscriptionReminderCount" = 0,
  "subscriptionLastReminderAt" = NULL;

-- ---------------------------------------------------------------------------
-- 15) Branch petty-cash wallets (KD branch pools)
-- ---------------------------------------------------------------------------
UPDATE "Wallet" SET "balance" = 0;

-- ---------------------------------------------------------------------------
-- 16) Invoice serial counters — next stamp recomputes from empty Order set (fresh A-1, B-1…)
-- ---------------------------------------------------------------------------
DELETE FROM "SerialCounter";

COMMIT;

-- =============================================================================
-- OPTIONAL (uncomment ONLY if you also want quantity/cost resets on inventory)
-- =============================================================================
-- BEGIN;
-- UPDATE "BranchStockLevel" SET "quantityOnHand" = 0, "avgUnitCost" = NULL, "lastMovementAt" = NULL;
-- COMMIT;
