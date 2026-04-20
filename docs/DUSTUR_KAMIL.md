# الدستور الكامل لنظام سفاري

## Safari‑ERP — Complete System Constitution (V19.3)

> **هذا الدستور هو المرجع النهائي للنظام.**
>
> يغطي: الفلسفة، الأدوار، الوحدات (Stages A–G)، مصفوفة الصلاحيات، نموذج البيانات،
> التدفقات المالية، المهام الدورية، واجهات API، المراقبة، والقائمة الهرمية الجديدة.
>
> الدستور التشغيلي للتدريب (لغة الميدان) يبقى منفصلاً في
> `DUSTUR_TASHGHIL_SAFARI.md`. هذا الملف هو توأمه التقني/الإداري.
>
> **اسم النظام:** Safari-ERP — سفاري لإدارة مغاسل الملابس.
> **الإصدار:** V19.3 — staging/v19.2-role-sync-and-cc-template.
> **المنصة:** NestJS (Backend) + React/Vite (Frontend) + PostgreSQL (Prisma) + Redis (Cache) + Sentry (Observability).
> **المنطقة الزمنية:** `Asia/Kuwait` (UTC+3) — ثابتة عبر كل جداول الكرون والجلسات.

---

## الفهرس

1. [المبادئ الحاكمة](#1-المبادئ-الحاكمة)
2. [خريطة الأدوار](#2-خريطة-الأدوار)
3. [خريطة الوحدات (Stages A–G)](#3-خريطة-الوحدات-stages-ag)
4. [مصفوفة الصلاحيات](#4-مصفوفة-الصلاحيات)
5. [نموذج البيانات](#5-نموذج-البيانات)
6. [التدفقات المالية](#6-التدفقات-المالية)
7. [دورة حياة الفاتورة والوردية](#7-دورة-حياة-الفاتورة-والوردية)
8. [المهام الدورية (Cron Jobs)](#8-المهام-الدورية-cron-jobs)
9. [واجهات API](#9-واجهات-api)
10. [الأمان والتدقيق](#10-الأمان-والتدقيق)
11. [المراقبة والصيانة](#11-المراقبة-والصيانة)
12. [القائمة الجانبية الهرمية (V19.3)](#12-القائمة-الجانبية-الهرمية-v193)
13. [النماذج المطبوعة](#13-النماذج-المطبوعة)
14. [خارطة الطريق](#14-خارطة-الطريق)

---

## 1) المبادئ الحاكمة

### 1.1 مبدأ الخمس أعين (Five Eyes)

لا يمر دينار واحد دون أن تراه خمس أعين مستقلة:


| #   | العين        | المسؤولية                                        |
| --- | ------------ | ------------------------------------------------ |
| 1   | السائق       | يُصدر الفاتورة ميدانياً (تسلسل عالمي لا يُزوَّر) |
| 2   | مدير الفرع   | يستلم النقد ويطابق المجاميع ويرفع صور الإيصالات  |
| 3   | المحاسب      | يراجع الإيداعات، يطابق K‑NET، يعتمد المصروفات    |
| 4   | المدير العام | يعتمد الوصولات ويشاهد كل شيء ما عدا Pulse        |
| 5   | المالك       | يرى كل شيء بما فيه Pulse ورادار السائقين         |


### 1.2 مبدأ الصلاحية الذرية (Atomic Authorization)

- `access-matrix.ts` هو المصدر الوحيد للحقيقة (Single Source of Truth).
- كل شاشة / نقطة دخول / زر حساس يستعلم من هذا الملف — **ممنوع** هاردكود الأدوار داخل المكوّنات.
- صيغة المفتاح: `<area>.<verb>` (مثل: `inventory.stockIn`, `orders.delete`).

### 1.3 مبدأ الاستقلال المحاسبي

- **الوردية ≠ تسليم الكاش**: الوردية تُغلق تلقائياً منتصف الليل، بينما تسليم العهدة حدث منفصل لكل مدير.
- **كل قيد مالي يدخل دفتر الأستاذ الموحد**: `GeneralLedgerEntry` (Single Ledger Pattern).
- **الخصم من المخزون تلقائي**: كل فاتورة مكتملة تُنقص `BranchStockLevel.quantityOnHand` فوراً.

### 1.4 مبدأ الساعات الميدانية

- `DRIVER` و `MANAGER` لا يستطيعان تسجيل الدخول إلا من **07:00 حتى 23:59 بتوقيت الكويت**.
- كل محاولة خارج هذا النطاق تُسجَّل في `AuditLog` تحت `OUTSIDE_WORKING_HOURS`.
- يمكن تعطيل هذا القيد مؤقتاً عبر متغير البيئة `AUTH_BYPASS_WORKING_HOURS=1` (للتشخيص فقط).

### 1.5 مبدأ الفصل التشغيلي

- **POS** حصري لـ `MANAGER` و `DRIVER` فقط.
- **Pulse / Live Monitor** حصري لـ `OWNER` (المدير العام لا يراه).
- **حذف الفواتير** حصري لـ `OWNER` و `ACCOUNTANT` فقط.

---

## 2) خريطة الأدوار


| الدور (`SafariRole`) | الغرض                                             | النطاق                                                                         |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| `OWNER`              | المالك — عين كل شيء + Pulse                       | كل الوحدات بلا استثناء                                                         |
| `GENERAL_MANAGER`    | العين الثانية — نفس صلاحيات المالك ناقص Pulse/حذف | نفس سايدبار المالك (Dastur §3.9)                                               |
| `ACCOUNTANT`         | محاسب الأصول — دفتر الأستاذ، K‑NET، الاعتمادات    | Finance + Inventory Stock-In + Reports + HR view                               |
| `MANAGER`            | مدير فرع                                          | POS + Custody + Expenses + Attendance + Leaves/Loans                           |
| `DRIVER`             | سائق ميداني                                       | POS Field + My Deposits + My Sales + Field Expenses + Debt Transfer signatures |
| `CALL_CENTER`        | مركز الاتصال                                      | Customers + Collections + Subscriptions + WhatsApp Tools                       |
| `SUPERVISOR`         | مراقب                                             | View-only على العمليات                                                         |
| `VIEWER`             | مُطّلع                                            | View-only مقيد                                                                 |
| `WORKER`             | عامل ميداني (محجوز للتوسعة)                       | محدود جداً                                                                     |


---

## 3) خريطة الوحدات (Stages A–G)

### Stage A — الأساس (V1–V11)

- `AuthModule` — JWT + RolesGuard + Access Matrix.
- `UsersModule` — إدارة الموظفين (كلمة مرور، دور، فرع).
- `BranchesModule` — إدارة الفروع.
- `OrdersModule` — الفواتير الميدانية والـ POS.
- `ShiftsModule` — الورديات (دورة يومية تلقائية 00:00).
- `FinanceModule` — الإيداعات، سحب الكاش، الرسوم البنكية.
- `SerialsModule` — العدّاد العالمي + مراقبة الفجوات.
- `ManagerCustodyModule` — عهدة نقد مديري الفروع.

### Stage B — التصدير والتقارير

- `ExportsModule` — توليد XLSX (`exceljs`) و PDF (`pdfkit`) على السيرفر.
- `ReportsModule` — تقارير تشغيلية شاملة.
- أزرار تصدير مدمجة في: reports-page, payroll, orders, attendance, inventory.

### Stage C — الذكاء الاصطناعي والتحليلات (AI/BI)

- `InsightsModule` يقدم 4 وظائف خفيفة الاعتماد:
  1. **Cash Forecast** — متوسط متحرك 30 يوم مع موسمية أيام الأسبوع.
  2. **Anomaly Detection** — تحليل Z‑score للحركات النقدية الشاذة.
  3. **Driver Performance Scoring** — KPIs مركّبة (تسليمات، تحصيل، وقت استجابة) مع Min‑Max scaling.
  4. **Weekly Executive Report** — PDF أسبوعي كل أحد 07:00 بتوقيت الكويت.
- صفحة `insights/ai` مع تبويبات حسب الصلاحية.

### Stage D — الموارد البشرية (HR)

- `AttendanceModule` — حضور/انصراف مع مصدر `MANUAL | BIOMETRIC | SYNCED_FROM_SHIFT`.
- `LeavesModule` — طلبات إجازة بـ 4 أنواع (`ANNUAL`, `SICK`, `UNPAID`, `EMERGENCY`) و 4 حالات.
- `LoansModule` — سلف موظفين مع خصم تلقائي من الراتب.
- `PayrollModule` — توليد كشوف رواتب مع خصومات الإجازات والسلف تلقائياً.
- نماذج مطبوعة A4 ملوّنة مع QR رقمي (`PrintableSheet` + `DocumentQR`).
- نقطة تحقق عامة `/api/verify/:type/:id` لأي ورقة مطبوعة.

### Stage E — المخزون وسلسلة التوريد

- `InventoryModule` — `StockItem` + `BranchStockLevel` مع تكلفة متوسطة مرجّحة.
- `InventoryCategory` + `Supplier` + `StockMovement` (IN/OUT/ADJUST/TRANSFER/STOCKTAKE).
- `PurchaseOrdersModule` — أوامر شراء كاملة (DRAFT → SENT → PARTIALLY_RECEIVED → RECEIVED / CANCELLED).
- **POS → Inventory auto-decrement**: كل طلب مكتمل يربط `OrderLineItem.stockItemId` وينقص المخزون ترانزاكشنالياً (يسمح بالسالب لعدم إعاقة البيع).
- Cron للتنبيه بالمخزون المنخفض يومياً 06:00.

### Stage F — تحسينات UX/UI

- **Skeleton Loaders**: `KpiRowSkeleton`, `TableSkeleton`, `CardSkeleton`, `ChartSkeleton`.
- **Unified Toast Notifications**: `notify.success/error/info/warning/promise`.
- **Responsive Audit**: POS و Driver محسّنان للهواتف.
- **Dark Mode**: `ThemeProvider` + `ThemeToggle` + `oklch` CSS variables مع مزامنة بين التابات و FOUC prevention.
- **Card Taxonomy**: مكوّن موحّد `StatTile` بستة tones (neutral/primary/success/warning/danger/highlight).
- **Purchase Order Workflow**: صفحة كاملة مع list/create/detail/receive dialogs.

### Stage G — المراقبة والصيانة (Observability)

- **Sentry**: التقاط الأخطاء في `main.ts` و `global-exception.filter.ts`.
- **Health Check**: `/api/health` (database + memory_heap + memory_rss) عبر `@nestjs/terminus`.
- **Build Identity**: `/api/version` عام يُرجع `{ name, version, gitCommit, buildTime, node, env, uptime, startedAt }` — يُستخدم من canary gates للتحقق من إنزال الـ SHA المتوقّع قبل فتح المرور.
- **Database Backup**: `scripts/pg-backup.sh` باستخدام `pg_dump` + دليل `docs/BACKUP.md`.
- **Prisma Migration Drift Guard**: `scripts/check-migration-drift.ts` + `npm run db:check-drift`.

### مميزات أخرى

- **DebtTransfersModule**: تحويل مديونيات السائق المغادر بتوقيعين رقميين.
- **SafariStreamModule**: بثّ حيّ (Pulse / Live Monitor) — `OWNER` فقط.
- **CustomerNotificationsModule**: تكامل SMS/WhatsApp.
- **CustomerLedgerModule**: دفتر أستاذ العميل.
- **FixedExpenseModule**: مصروفات ثابتة ذاتية الجدولة.

---

## 4) مصفوفة الصلاحيات

`web/src/modules/shared/auth/access-matrix.ts` ≈ 242 سطراً، يضم عشرات المفاتيح مقسّمة:

### 4.1 عمليات وفواتير


| مفتاح                | الأدوار                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `orders.view`        | OWNER, GM, MANAGER, DRIVER, CALL_CENTER, ACCOUNTANT, SUPERVISOR, VIEWER |
| `orders.createQuick` | DRIVER فقط                                                              |
| `orders.delete`      | OWNER, ACCOUNTANT فقط                                                   |
| `shifts.view`        | جميع أدوار العمليات                                                     |
| `pos.use`            | MANAGER, DRIVER فقط                                                     |


### 4.2 المالية والتقارير


| مفتاح                      | الأدوار               |
| -------------------------- | --------------------- |
| `financials.view`          | OWNER, GM             |
| `knetAudit.reconcile`      | ACCOUNTANT فقط        |
| `knetAudit.view`           | OWNER, GM, ACCOUNTANT |
| `unifiedLedger.view`       | OWNER, GM, ACCOUNTANT |
| `expenseApproval.act`      | ACCOUNTANT فقط        |
| `managerCustodyAging.view` | OWNER, GM, ACCOUNTANT |
| `staffDebts.act`           | ACCOUNTANT فقط        |
| `reports.view`             | OWNER, GM, ACCOUNTANT |


### 4.3 تحويل المديونيات


| مفتاح                                     | الأدوار                                           |
| ----------------------------------------- | ------------------------------------------------- |
| `debtTransfer.view`                       | OWNER, GM, ACCOUNTANT                             |
| `debtTransfer.create`                     | GM, ACCOUNTANT فقط (OWNER مقصود بعدم بدء العملية) |
| `debtTransfer.finalize`                   | GM, ACCOUNTANT                                    |
| `debtTransfer.sign` / `debtTransfer.mine` | DRIVER                                            |


### 4.4 المخزون


| مفتاح                                                             | الأدوار               |
| ----------------------------------------------------------------- | --------------------- |
| `inventory.catalog.view`                                          | OWNER, GM, ACCOUNTANT |
| `inventory.catalog.manage`                                        | ACCOUNTANT فقط        |
| `inventoryReport.stockIn`                                         | ACCOUNTANT فقط        |
| `inventory.stockOut`                                              | ACCOUNTANT, MANAGER   |
| `inventory.transfer` / `inventory.stocktake` / `inventory.adjust` | ACCOUNTANT فقط        |


### 4.5 أوامر الشراء


| مفتاح                                       | الأدوار                        |
| ------------------------------------------- | ------------------------------ |
| `purchaseOrders.view`                       | OWNER, GM, ACCOUNTANT, MANAGER |
| `purchaseOrders.create/send/cancel/receive` | OWNER, GM, ACCOUNTANT          |


### 4.6 الموارد البشرية


| مفتاح                                   | الأدوار                        |
| --------------------------------------- | ------------------------------ |
| `attendance.view` / `attendance.manual` | OWNER, GM, MANAGER, ACCOUNTANT |
| `attendance.sync`                       | OWNER فقط                      |
| `hr.leaves.approve`                     | OWNER, GM, MANAGER, ACCOUNTANT |
| `hr.leaves.mine`                        | جميع الأدوار                   |
| `hr.loans.approve`                      | OWNER, GM, ACCOUNTANT          |
| `payroll.view`                          | OWNER, GM                      |


### 4.7 العملاء ومركز الاتصال


| مفتاح                                                        | الأدوار                |
| ------------------------------------------------------------ | ---------------------- |
| `customers.view` / `collections.view` / `subscriptions.view` | OWNER, GM, CALL_CENTER |
| `customers.manage` / `subscribers.manage`                    | OWNER, CALL_CENTER     |
| `collections.act` / `subscriptions.manage`                   | CALL_CENTER فقط        |
| `whatsappTools.use`                                          | OWNER, GM, CALL_CENTER |


### 4.8 الذكاء الاصطناعي


| مفتاح                                                    | الأدوار                        |
| -------------------------------------------------------- | ------------------------------ |
| `insights.view`                                          | OWNER, GM, ACCOUNTANT, MANAGER |
| `insights.cashForecast.view` / `insights.anomalies.view` | OWNER, GM, ACCOUNTANT          |
| `insights.driverScorecard.view`                          | OWNER, GM, MANAGER             |
| `insights.executive.view`                                | OWNER, GM                      |


### 4.9 الرقابة العلوية


| مفتاح                                                             | الأدوار   |
| ----------------------------------------------------------------- | --------- |
| `liveMonitor.view` / `driverMonitor.view` / `shiftCycle.runNow`   | OWNER فقط |
| `branches.manage` / `ownerSerials.manage` / `ownerDashboard.view` | OWNER, GM |


---

## 5) نموذج البيانات

### 5.1 إحصاءات

- **43 جدولاً** في `prisma/schema.prisma` (~1282 سطر).
- **20+ Enum** لإحكام القيم: `SafariRole`, `OrderStatus`, `ShiftStatus`, `PosPaymentMethod`, `DebtSource`, `DebtEntityCategory`, `DepositStatus`, `ExpenseStatus`, `PayrollStatus`, `AttendanceSource`, `LeaveType`, `LeaveStatus`, `LoanStatus`, `StockMovementType`, `PurchaseOrderStatus`, `DebtTransferStatus`, `ManagerCashCustodyStatus`, …

### 5.2 الكتل الرئيسية

**المستخدمون والفروع**

- `User` ↔ `Role` ↔ `Permission` (M:N عبر جدول وسيط).
- `User` يحمل: `safariRole`, `branchId`, `driverSerialPrefix`, HR fields (`hireDate`, `baseSalary`, `iban`).
- `Branch` يحوي فروع مستقلة مع إعداداتها.

**العمليات والفواتير**

- `Order` (الفاتورة) ← `OrderLineItem` ← `StockItem` (ربط المخزون).
- `SerialCounter` — عدّاد عالمي واحد لكل السنة، يمنع تكرار الرقم.
- `Shift` (وردية) — حالات: `OPEN`, `CLOSED`, `ARCHIVED`.
- `PosPaymentBundle` — دفعات POS مع `PaymentMethodFeeConfig`.

**المالية**

- `GeneralLedgerEntry` — دفتر الأستاذ الموحد (إيرادات، مصروفات، رسوم بنك، عمولات).
- `BankDepositLog` / `Deposit` — إيداعات بنكية.
- `DebtLedgerEntry` — دفتر ديون (عميل أو موظف).
- `BranchExpense` — مصروفات فرع بأربع حالات (`DRAFT → SUBMITTED → APPROVED → REJECTED`).
- `FixedExpenseSchedule` — مصروفات ثابتة متكررة.
- `ManagerCashCustody` — عهدة كل مدير مع التقادم.
- `DebtTransfer` + `DebtTransferOrder` — تحويل ديون بتوقيعين.

**الموارد البشرية**

- `AttendanceLog` — سجل حضور (مع المصدر).
- `LeaveRequest` — طلبات إجازة.
- `EmployeeLoan` — سلف موظفين.
- `Payroll` — كشوف رواتب.

**المخزون**

- `InventoryCategory` ← `StockItem` (SKU عالمي) ← `BranchStockLevel` (الكمية لكل فرع).
- `Supplier` — المورّدون.
- `StockMovement` — سجل كل حركة (IN/OUT/ADJUST/TRANSFER/STOCKTAKE).
- `PurchaseOrder` ← `PurchaseOrderLine` ← `PurchaseOrderReceipt` ← `PurchaseOrderReceiptLine`.

**العملاء والاشتراكات**

- `Customer` — بيانات العميل + المحفظة الذكية.
- `SubscriptionPlan` — باقات شهرية/سنوية.
- `CustomerWallet` + `TransactionHistory` — محفظة رصيد.
- `LaundryItemCategory` ← `LaundryPriceListItem` ← `LaundryBranchItemPrice`.

**البنية التحتية**

- `AuditLog` — سجل أمني عام (login, hard-delete, outside-working-hours, serial-gap).
- `Wallet` — محافظ مستقبلية.

---

## 6) التدفقات المالية

### 6.1 Single Ledger Pattern

كل قيد مالي، مهما كان مصدره، يمر عبر `GeneralLedgerEntry`:

```
إيراد فاتورة      ──┐
إيداع بنكي        ──┤
رسوم بنك/KNET     ──┼──▶  GeneralLedgerEntry  ──▶  Reports + Insights
مصروف معتمد       ──┤
راتب موظف         ──┤
سلفة / خصم        ──┘
```

### 6.2 فصل العهدة عن الوردية

- **الوردية** تُغلق تلقائياً منتصف الليل عبر `ShiftCycleService` (Cron `0 0 * * `*).
- **تسليم الكاش** حدث مستقل: `ManagerCashCustody` يفتح للمدير عند قبض أول سائق، يُغلق عند تسليمه للبنك أو المحاسب.
- بذلك لا يتعرقل إغلاق الوردية لانتظار تسليم الكاش.

### 6.3 دورة تحويل المديونيات

```
GM/ACCOUNTANT يُنشئ التحويل
  ↓
السائق المغادر يوقّع رقمياً (DRIVER.sign)
  ↓
السائق المستلم يوقّع رقمياً (DRIVER.sign)
  ↓
GM/ACCOUNTANT يعتمد (finalize)
  ↓
تُنقل الفواتير المعلّقة من المغادر إلى المستلم
  ↓
يُسجَّل قيد واحد في GeneralLedgerEntry + AuditLog
```

### 6.4 خصم المخزون التلقائي (POS → Inventory)

- عند إكمال طلب (`OrdersService.posCheckout` أو `PaymentsService.finalize*`) يتم استدعاء `InventoryService.applyOrderStockDecrement` ترانزاكشنالياً.
- يُسمح بالسالب لعدم إعاقة البيع، مع تسجيل كل حركة في `StockMovement` للتدقيق.

### 6.5 خصم السُلف من الراتب

- `PayrollService` يستعلم `EmployeeLoan` لكل موظف عند توليد كشف الراتب.
- يخصم القسط الشهري تلقائياً ويعدّل رصيد السلفة.
- يظهر الخصم في كشف الراتب المطبوع.

---

## 7) دورة حياة الفاتورة والوردية

### 7.1 الفاتورة

```
DRAFT  ──▶  PENDING  ──▶  PAID  ──▶  (اختياري) REFUNDED
```

- `DRAFT`: مسودة داخل POS.
- `PENDING`: صدرت الفاتورة، بانتظار الدفع (نقد مؤجل / تحويل).
- `PAID`: اكتملت + خُصم المخزون + سُجّل قيد GL.
- `REFUNDED`: استرداد (نادر، يتطلب موافقة).

### 7.2 الوردية

```
OPEN (00:00 Kuwait)  ──▶  CLOSED (23:59)  ──▶  ARCHIVED (بعد الأرشفة)
```

### 7.3 عداد التسلسل العالمي

- `SerialCounter` يُنتج رقماً واحداً فقط في الثانية لكل فرع.
- `SerialGapService` يفحص يومياً 00:05 الفجوات ويسجّلها في `AuditLog`.
- الواجهة في `OwnerSerialsPage` تعرض السائقين وبادئاتهم والفجوات فوراً.

---

## 8) المهام الدورية (Cron Jobs)


| Cron         | الخدمة                                  | التوقيت (Asia/Kuwait)     | الوظيفة                              |
| ------------ | --------------------------------------- | ------------------------- | ------------------------------------ |
| `0 0 * * *`  | `ShiftCycleService`                     | يومياً 00:00              | إغلاق ورديات اليوم + فتح ورديات الغد |
| `5 0 * * *`  | `SerialGapService`                      | يومياً 00:05              | فحص فجوات عدّاد الفواتير             |
| `0 6 * * *`  | `LowStockCronService`                   | يومياً 06:00              | تنبيه بالأصناف تحت الحد الأدنى       |
| `5 21 * * *` | `AttendanceService.syncShiftAttendance` | يومياً 00:05 اليوم التالي | مزامنة حضور من الورديات              |
| `0 7 * * 0`  | `WeeklyExecutiveReportService`          | أحد 07:00                 | توليد تقرير تنفيذي PDF               |


---

## 9) واجهات API

النظام يضم **38+ موديولاً** مسجّلاً في `app.module.ts`:

### Backend Modules (`src/app.module.ts`)

```
PrismaModule, PermissionsModule, FinanceModule, AuthModule,
SafariStreamModule, UsersModule, ReportsModule, PaymentMethodFeesModule,
SystemModule, ExpensesModule, ExportsModule, PayrollModule,
FixedExpenseModule, OrdersModule, PaymentsModule, BranchesModule,
WalletsModule, AuditLogsModule, SubscriptionPlansModule, SubscribersModule,
CallCenterModule, LaundryPriceListModule, InventoryModule,
PurchaseOrdersModule, InsightsModule, ManagerCustodyModule, PosModule,
CustomersModule, DebtTransfersModule, SerialsModule, ShiftsModule,
AttendanceModule, LeavesModule, LoansModule, VerifyModule, HealthModule
```

### أمثلة نقاط النهاية الحساسة


| Endpoint                           | الطريقة    | الحارس                              | الغرض                        |
| ---------------------------------- | ---------- | ----------------------------------- | ---------------------------- |
| `/api/auth/login`                  | POST       | —                                   | تسجيل دخول + فحص ساعات العمل |
| `/api/health`                      | GET        | Public                              | Health check                 |
| `/api/version`                     | GET        | Public                              | هوية البناء (version, gitCommit, buildTime, node, env, uptime) |
| `/api/verify/:type/:id`            | GET        | Public                              | التحقق من نموذج مطبوع عبر QR |
| `/api/orders`                      | POST/PATCH | JwtAuth + Roles                     | إدارة الفواتير               |
| `/api/orders/:id`                  | DELETE     | `orders.delete` (OWNER, ACCOUNTANT) | حذف فاتورة                   |
| `/api/debt-transfers`              | POST       | `debtTransfer.create`               | إنشاء تحويل مديونية          |
| `/api/debt-transfers/:id/sign`     | POST       | `debtTransfer.sign`                 | توقيع السائق                 |
| `/api/purchase-orders`             | POST       | `purchaseOrders.create`             | إنشاء PO                     |
| `/api/purchase-orders/:id/receive` | POST       | `purchaseOrders.receive`            | استلام بضاعة                 |
| `/api/insights/cash-forecast`      | GET        | `insights.cashForecast.view`        | توقع نقدي                    |
| `/api/insights/anomalies`          | GET        | `insights.anomalies.view`           | رصد الشذوذ                   |
| `/api/insights/driver-scorecard`   | GET        | `insights.driverScorecard.view`     | أداء السائقين                |
| `/api/exports/orders.xlsx`         | GET        | `reports.view`                      | تصدير فواتير Excel           |
| `/api/exports/payroll.pdf`         | GET        | `payroll.view`                      | كشف رواتب PDF                |


---

## 10) الأمان والتدقيق

### 10.1 الحراسة

- `JwtAuthGuard` — تحقق JWT على كل endpoint ما عدا `@Public()`.
- `RolesGuard` — يقرأ `@Roles(...)` ويطابق مع `safariRole`.
- `access-matrix.ts` — مصدر الحقيقة الوحيد للصلاحيات في الفرونت (والباك يحاكيها يدوياً عبر `@Roles`).

### 10.2 ساعات العمل الميدانية

- `AuthService.login` يرفض `DRIVER`/`MANAGER` خارج 07:00–23:59 بتوقيت الكويت.
- يمكن تعطيل مؤقتاً عبر `AUTH_BYPASS_WORKING_HOURS=1` (مع تحذير في السجلات).
- كل محاولة مرفوضة تُسجَّل كـ `OUTSIDE_WORKING_HOURS` في `AuditLog`.

### 10.3 حماية Pulse

- `SafariStreamModule` (البث الحي) و `/admin/live-monitor` مقفلان على `OWNER` فقط.
- المدير العام **لا يرى** هذه الواجهة (تطبيقاً لمبدأ Dastur §3.9).

### 10.4 حماية حذف الفواتير والمستخدمين

- حذف الفاتورة: `OWNER` + `ACCOUNTANT` فقط.
- حذف المستخدم: `OWNER` فقط (المدير العام ممنوع من hard-delete).
- كل حذف يُولّد `AuditLog` تفصيلياً (من، متى، ماذا، لماذا).

### 10.5 جدول `AuditLog`

يسجّل الأحداث الأمنية المهمة:

- `LOGIN_SUCCESS` / `LOGIN_FAILED` / `OUTSIDE_WORKING_HOURS`.
- `ORDER_HARD_DELETED` / `USER_HARD_DELETED`.
- `SERIAL_GAP_DETECTED`.
- `DEBT_TRANSFER_SIGNED` / `DEBT_TRANSFER_FINALIZED`.
- `SHIFT_CYCLE_RAN`.

---

## 11) المراقبة والصيانة

### 11.1 Sentry

- مُهيّأ في `src/main.ts` + `src/common/filters/global-exception.filter.ts`.
- يلتقط كل exception غير معالج تلقائياً.
- متغيرات البيئة: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`.

### 11.2 Health Check

- `GET /api/health` يُرجع:

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "memory_heap": { "status": "up" },
    "memory_rss": { "status": "up" }
  }
}
```

### 11.3 Database Backup

- `scripts/pg-backup.sh` يستخدم `pg_dump -F c` لنسخ مضغوطة.
- التفاصيل في `docs/BACKUP.md`.

### 11.4 Migration Drift Guard

- `npm run db:check-drift` يقارن `schema.prisma` مع حالة قاعدة البيانات.
- يُستخدم في CI ليمنع نشر migrations غير متزامنة.

### 11.5 الأدلة المرجعية

- `docs/OBSERVABILITY.md` — Sentry + health check.
- `docs/BACKUP.md` — النسخ الاحتياطي.
- `docs/DUSTUR_TASHGHIL_SAFARI.md` — الدستور التشغيلي (لغة الميدان).
- `docs/STAGING_V19_2.md` — ملاحظات staging الحالية.

---

## 12) القائمة الجانبية الهرمية (V19.3)

### 12.1 سايدبار المالك والمدير العام

ستة أقسام ملوّنة + قسم رئيسي، مطبّقة في `default-nav-config.ts`:


| اللون | المفتاح                      | العنوان             | الصفحات                                                                                                                                          |
| ----- | ---------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| ⚪     | `nav.groupMain`              | رئيسي               | لوحة القيادة                                                                                                                                     |
| 🔵    | `nav.groupFinance`           | المالية والتقارير   | التقرير المالي، الكشوفات، تقرير الدورة، مطابقة K-NET، الدفتر الموحد، تحليلات AI، اعتماد المصروفات، تحويل المديونيات، المصاريف الثابتة، المصروفات |
| 🟢    | `nav.groupHr`                | الموارد البشرية     | الرواتب، الحضور والانصراف، طلبات الإجازة، السُلف                                                                                                 |
| 🟠    | `nav.groupInventoryOps`      | المخزون والعمليات   | الأصناف والأسعار، تقرير المخزون، إدارة التسلسل، تنبيهات المخزون، حركات المخزون، كتالوج المخزون، أوامر الشراء                                     |
| 🟣    | `nav.groupCustomersSubs`     | العملاء والاشتراكات | العملاء، متابعة ديون العملاء، الاشتراكات، المشتركين                                                                                              |
| 🔴    | `nav.groupPaymentCollection` | الدفع والتحصيل      | بيانات الفواتير، تقرير تحصيل الديون، العهدات النقدية، مسار أموال الموظفين                                                                        |
| ⚫     | `nav.groupAdminSettings`     | الإعدادات والإدارة  | إدارة المستخدمين، الفروع، رادار السائقين، الورديات، أدوات الواتس                                                                                 |


### 12.2 تطبيق اللون

- نقطة ملوّنة صغيرة (`h-1.5 w-1.5 rounded-full`) + نص بلون القسم.
- متوافق مع Dark Mode (`text-sky-700 dark:text-sky-300`).
- ينعكس في كل من `executive-sidebar.tsx` و `mobile-bottom-nav.tsx` لضمان اتساق التجربة.

### 12.3 السايدبار الخاص بالأدوار الأخرى

- `managerSidebarNavGroups` / `accountantSidebarNavGroups` / `callCenterSidebarNavGroups` / `driverSidebarNavGroups` تبقى منفصلة ومتخصّصة لكل دور.
- `resolveSidebarNav` يختار الملف المناسب بناءً على `user.safariRole`.

---

## 13) النماذج المطبوعة

### 13.1 البنية التحتية المشتركة

- `web/src/modules/shared/print/PrintableSheet.tsx` — إطار A4 ملوّن.
- `web/src/modules/shared/print/DocumentQR.tsx` — رمز QR رقمي.
- `web/src/modules/shared/print/printable.css` — أنماط الطباعة (colored design + page breaks).

### 13.2 النماذج المتاحة


| المستند       | المسار                              | التحقق العام                    |
| ------------- | ----------------------------------- | ------------------------------- |
| كشف راتب      | `/payroll/print/:id`                | `/api/verify/payroll/:id`       |
| طلب إجازة     | `/leaves/print/:id`                 | `/api/verify/leave/:id`         |
| سلفة موظف     | `/loans/print/:id`                  | `/api/verify/loan/:id`          |
| تقرير حضور    | `/attendance/print/:id`             | `/api/verify/attendance/:id`    |
| تحويل مديونية | `/finance/debt-transfers/:id/print` | `/api/verify/debt-transfer/:id` |


### 13.3 نقطة التحقق العامة

- مسار عام (بدون JWT) `/api/verify/:type/:id` يُرجع بيانات موجزة بعد مسح QR.
- يُمكّن أي طرف خارجي (بنك/حكومة) من التحقق من صحة الورقة المطبوعة.

---

## 14) خارطة الطريق

### ✅ مكتمل (V19.3)

- Stages A–G (الأساس، التصدير، AI/BI، HR، المخزون، UX، المراقبة).
- Dark Mode كامل.
- Card Taxonomy موحّد.
- Purchase Order Workflow.
- POS → Inventory auto-decrement.
- Sentry + Health + Backup + Drift Guard.
- القائمة الجانبية الهرمية الملوّنة.

### 🟡 قيد الدراسة

- سجل الجزاءات (Penalty Log) كوحدة مستقلة في HR.
- دمج API بيومتري حقيقي مع `AttendanceService` (الحالي stub).
- لوحة Observability داخلية تعرض Sentry + metrics في `/admin/observability`.
- إضافة نسب مقارنة أسبوعية/شهرية في تقارير AI.
- إضافة Push Notifications للهاتف المحمول.

### 🔮 مقترحات طويلة المدى

- PWA offline mode للسائق (تخزين الفواتير محلياً عند انقطاع الشبكة).
- فهرس دلالي (semantic search) داخل الفواتير والعملاء عبر LLM صغير.
- تكامل مباشر مع EFR / بنك الكويت الوطني لتأكيد الإيداعات فوراً.

---

## الملاحق

### الملحق A — متغيرات البيئة الأساسية

```env
# Database
DATABASE_URL=postgresql://...

# Auth
JWT_SECRET=...
AUTH_BYPASS_WORKING_HOURS=0   # Set 1 للتشخيص فقط

# Sentry
SENTRY_DSN=...
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=v19.3

# Timezone
TZ=Asia/Kuwait

# SMS/WhatsApp
SMS_PROVIDER_KEY=...
WHATSAPP_API_URL=...
```

### الملحق B — أوامر التشغيل

```bash
# Development
npm run dev                  # Backend (watch)
cd web && npm run dev        # Frontend (Vite)

# Production Build
npm run build
cd web && npm run build

# Production Start
npm run start                # node dist/src/main.js

# Database
npm run db:migrate
npm run db:check-drift
./scripts/pg-backup.sh

# Linting / Types
npm run lint
cd web && npx tsc -p tsconfig.app.json --noEmit
```

### الملحق C — مسرد المصطلحات


| المصطلح                    | التعريف                                               |
| -------------------------- | ----------------------------------------------------- |
| **Five Eyes (الخمس أعين)** | مبدأ التحقق المتعدد: لا يمر دينار دون 5 مستويات رقابة |
| **Single Ledger Pattern**  | كل قيد مالي يُسجَّل في `GeneralLedgerEntry` الموحّد   |
| **Dastur**                 | الدستور — مبادئ تشغيل النظام الحاكمة                  |
| **Pulse**                  | شاشة المراقبة الحيّة للسائقين (`OWNER` فقط)           |
| **Custody**                | عهدة النقد بيد مدير الفرع                             |
| **Serial Gap**             | فجوة في عدّاد الفواتير (مؤشر احتيال محتمل)            |
| **Debt Transfer**          | تحويل مديونيات سائق مغادر لسائق مستلم                 |
| **Working Hours Window**   | نافذة 07:00–23:59 للسائقين والمدراء                   |


---

**هذا الدستور حيّ — يتحدّث مع كل إصدار.**

للاقتراحات والتعديلات، ارفع PR على فرع `docs/dastur-`* واطلب مراجعة `OWNER` + `GENERAL_MANAGER` قبل الدمج.

> *"النظام بلا دستور، ديوانية بلا قهوة."*

