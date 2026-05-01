-- =============================================================================
-- Safari ERP — Production go-live purge (PostgreSQL)
-- =============================================================================
-- PURPOSE:
--   • كل البيانات التشغيلية/التجريبية المالية مع حذف **عملاء** التجربة وحسابات
--     الموظفين الغير ضرورية، مع الإبقاء على الكتلوج، الفروع، إعدادات النظام،
--     وخطط الاشتراك، والمحافظات الفارغة للفروع.
--   • إفراغ «ترقيم الفواتير» عبر جدول "SerialCounter".
--
-- يُترك بدون مساس (طبق مخطط Prisma الفعلي):
--   LaundryItemCategory · LaundryPriceListItem · LaundryBranchItemPrice
--   SubscriptionPlan · CommissionRule · DebtHoldPolicy · PayrollSettings · SystemToggle
--   PaymentMethodFeeConfig · Role · Permission · Branch · قائمة جهات الشراء والموردين (إن وُجدت)
--
-- ⚠️  نفّذه فقط بعد نسخة احتياطية كاملة (pg_dump أو لقطة سحابية).
--
-- ⚠️  يجب وجود حساب واحد على الأقل بدور OWNER وإلا يتوقّف السكربت تعمّداً.
--
-- أدوار المستخدمين المعاد الاحتفاظ بها (عدّّل قبل التشغيل إن احتجت):
--     OWNER, GENERAL_MANAGER, ACCOUNTANT — أضِف 'MANAGER' أو غيرها داخل الشرط لو لزم.
--
-- المنفَّذ بعد قاعدة البيانات (يدوي):
--   1) تفريغ IndexedDB بالمتصفّح على أجهزة POS: safari-erp-offline-v1
--   2) حذف محتويات مجلدات الرفع على الخادم (انظر scripts/go-live-clear-uploads.ps1)
-- =============================================================================

DO $prd_guard$
BEGIN
  IF (SELECT COUNT(*)::int FROM "User" WHERE "safariRole" = 'OWNER') < 1 THEN
    RAISE EXCEPTION 'go-live-production-ready.sql: refuse to continue — database has no OWNER. Create/copy an OWNER user first.';
  END IF;
END $prd_guard$;

BEGIN;

-- ---------------------------------------------------------------------------
-- المرحلة أ — أوامر مالية وأعمال ومخزون (نفس أساس scripts/go-live-reset-financial.sql)
-- ---------------------------------------------------------------------------

DELETE FROM "CommissionPayout";
DELETE FROM "DebtHold";

UPDATE "DebtLedgerEntry" SET "refEntryId" = NULL WHERE "refEntryId" IS NOT NULL;
DELETE FROM "DebtLedgerEntry";

DELETE FROM "TransactionHistory";

DELETE FROM "InvoiceAuditLog";
DELETE FROM "OrderFeedback";
DELETE FROM "OrderLineItem";
DELETE FROM "DebtTransferOrder";
DELETE FROM "DebtTransfer";

DELETE FROM "BankDepositLog";
DELETE FROM "ManagerCashCustody";
DELETE FROM "Deposit";

DELETE FROM "GeneralLedgerEntry";

DELETE FROM "Order";
DELETE FROM "PosPaymentBundle";

UPDATE "CustomerSubscription" SET "parentSubscriptionId" = NULL WHERE "parentSubscriptionId" IS NOT NULL;
DELETE FROM "CustomerSubscription";

DELETE FROM "Shift";

DELETE FROM "PayrollAdHocLine";
DELETE FROM "Payroll";
DELETE FROM "EmployeeLoan";
DELETE FROM "AttendanceLog";
DELETE FROM "LeaveRequest";

DELETE FROM "BranchExpense";
DELETE FROM "VehicleExpense";

UPDATE "PurchaseOrderReceiptLine" SET "stockMovementId" = NULL WHERE "stockMovementId" IS NOT NULL;
DELETE FROM "StockMovement";
DELETE FROM "PurchaseOrderReceiptLine";
DELETE FROM "PurchaseOrderReceipt";
DELETE FROM "PurchaseOrderLine";
DELETE FROM "PurchaseOrder";

-- سجل تشغيل (اختياري — أزل التعليق لمسح كل AuditLog الإداري أيضاً)
DELETE FROM "AuditLog";

-- ---------------------------------------------------------------------------
-- المرحلة ب — حذف كل العملاء (تُحذف "CustomerWallet" تلقائياً وفق Cascade)
-- ---------------------------------------------------------------------------

DELETE FROM "Customer";

-- ---------------------------------------------------------------------------
-- المرحلة ج — صناديق الفروع الفورية (ليست عميلاً بعد حذف العملاء فقط المحفظة الفرعية)
-- ---------------------------------------------------------------------------

UPDATE "Wallet" SET "balance" = 0;

-- ---------------------------------------------------------------------------
-- المرحلة د — عدّاد السيريال/الرمز الموحّد — أول خط جديد سيُنشأ بعدها من القيم الأولى
-- ---------------------------------------------------------------------------

DELETE FROM "SerialCounter";

-- ---------------------------------------------------------------------------
-- المرحلة هـ — جلسات تسجيل الدخول، ثم الموظفون غير المدرجين ضمن «الإداريين»
-- (RefreshToken ينجرف أحياناً — نُفرِّغه قبل حذف المستخدم لتفادي قيود الواجهة)
-- ---------------------------------------------------------------------------

DELETE FROM "RefreshToken";

DELETE FROM "User"
WHERE "safariRole" NOT IN ('OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT');

COMMIT;

-- =============================================================================
-- مخزون اختياري: تصفير كميات المخزون (أزل التعليق عند الرغبة)
-- =============================================================================
-- BEGIN;
-- UPDATE "BranchStockLevel" SET "quantityOnHand" = 0, "avgUnitCost" = NULL, "lastMovementAt" = NULL;
-- COMMIT;
