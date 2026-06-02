# Worker Production Implementation Report

> Mission: **WORKER PRODUCTION WORKFLOW** — تفعيل رتبة `WORKER` كوظيفة تشغيلية
> حقيقية لإدارة دورة القطعة، **دون** تغيير المحاسبة / POS / منطق
> الفواتير والدفع. الطبقة كلها **إضافية (additive-only)**.

## 1. ما تم بناؤه

- **طبقة إنتاج كاملة** (Production Worker Layer): تتبّع القطعة من
  `RECEIVED` حتى `DELIVERED`، مع مراحل استثناء للجودة/التلف/الفقد.
- **تدفق المهمة للعامل**: Accept → Start → Complete، + Report Issue + Add Note.
- **SLA لتسليم المراحل** مع احتساب التأخير على المرحلة/العامل التالي.
- **مسار الجودة**: بلاغ خلل → `QUALITY_HOLD` → قرار مدير/مالك.
- **سجلات دائمة (append-only)** + AuditLog لكل حدث حسّاس.
- **لوحات**: لوحة إنتاج للمدير/المشرف، ولوحة Owner متعددة الفروع.
- **شاشة العامل في تطبيق الموظفين** (التجربة الأساسية) + شاشات إدارة في الويب.

## 2. الجداول الجديدة (Prisma)

`Garment`, `GarmentStageEvent`, `WorkerProductionLog`, `GarmentIssue`,
`ProductionDecision`.

**Enums:** `GarmentStage`, `ProductionWorkType`, `GarmentTaskStatus`,
`StageHandoffStatus`, `GarmentStageAction`, `GarmentIssueType`,
`GarmentIssueStatus`, `ProductionDecisionType`.

**Migration:** `prisma/migrations/20260602190000_production_worker_layer/migration.sql`
(additive: `CREATE TYPE` / `CREATE TABLE` / `CREATE INDEX` فقط — لا تعديل ولا
حذف لأي جدول قائم). المراجع إلى `User/Order/Branch/OrderLineItem` عبر أعمدة
UUID قياسية + Index، لتفادي أي مساس بالنماذج المالية الكبيرة.

## 3. الصلاحيات الجديدة

`production.view`, `production.work`, `production.manage` +
specialisation: `production.washing/drying/ironing/packing/qc`.

- `WORKER`: view + work + كل تخصصات العمل. **صفر** صلاحية مالية/فواتير/نقد/عملاء.
- `MANAGER`: view + manage. `SUPERVISOR` / `GENERAL_MANAGER`: view. `OWNER`: الكل.
- مُطبَّقة في الباك (`roles-permissions.map.ts`) والواجهة
  (`app-permissions.ts` / `access-matrix.ts`).

## 4. الشاشات

| الشاشة | المكان | الوصول |
| --- | --- | --- |
| `/(app)/(worker)/tasks` | employee-mobile | WORKER (أساسي) |
| `/worker/tasks` | web | معاينة/دعم للمدير |
| `/production/board` | web | MANAGER/SUP/GM/OWNER |
| `/production/issues` | web | MANAGER/SUP/GM/OWNER |
| `/production/garments/:id` | web | MANAGER/SUP/GM/OWNER |
| `/production/workers` | web | MANAGER/SUP/GM/OWNER |

## 5. الـ Endpoints

**Worker** (`@Roles(WORKER)`): `GET /worker/tasks`,
`GET /worker/tasks/:id/timeline`, `POST /worker/tasks/:id/{accept|start|complete|report-issue|note}`.

**Production**: `GET /production/board`, `GET /production/issues`,
`GET /production/garments/:id/timeline`, `GET /production/workers/:id/logs`,
`GET /production/owner/dashboard` (OWNER/GM),
`GET /production/orders/:orderId/customer-status` (CALL_CENTER+),
`POST /production/garments` (MANAGER/OWNER),
`POST /production/issues/:id/decision` (MANAGER/OWNER),
`POST /production/tasks/:id/reassign` (MANAGER/OWNER).

كلها محميّة بـ `JwtAuthGuard + RolesGuard` + فحوص نطاق الفرع/الملكية داخل الخدمة.

## 6. الاختبارات

`src/production/production.service.spec.ts` — **12/12 ناجحة**:

- worker لا يبدأ قبل القبول / لا يكمل ما ليس IN_PROGRESS.
- Accept → Start → Complete ينقل للمرحلة التالية ويسلّمها.
- التأخير عند القبول المتأخر يُنسب للعامل التالي.
- Report Issue ينقل القطعة إلى `QUALITY_HOLD` ويفتح بلاغاً + AuditLog.
- قطعة عليها بلاغ مفتوح لا يمكن إكمالها (تمنع الوصول `READY`).
- عزل الفرع + عزل العامل (لا يلمس مهام/فرع آخر).
- timeline (`GarmentStageEvent`) append-only (لا update/delete).
- RBAC: `WORKER` لا يملك أي صلاحية مالية/فواتير/نقد/عملاء/إدارة.

التحقق: backend `tsc --noEmit` نظيف، web `tsc -b` نظيف، employee-mobile
`tsc --noEmit` نظيف.

## 7. المخاطر المتبقية / Follow-ups

- **توليد القطع (intake):** يتم عبر `POST /production/garments` يدوياً من
  المدير؛ لم يُربَط تلقائياً بإنشاء الطلب/الفاتورة (قرار متعمّد لعدم لمس مسار
  POS). يمكن لاحقاً ربطه عبر Domain Event عند تأكيد الطلب.
- **Typed-routes للموبايل:** ملف `.expo/types/router.d.ts` يُعاد توليده عند
  أول `expo start`؛ مسار العامل ممرَّر مؤقتاً عبر `as Href` ويصبح no-op بعد
  التوليد.
- **حالة `DELIVERED`** متروكة لمسار التسليم القائم (السائق) ولم تُدمج آلياً
  مع `Garment` لتفادي تغيير منطق التسليم الحالي.
- **عدّاد `DELAYED_HANDOFF`** يُحتسب لحظياً عبر `isLate()` عند القراءة؛ لا
  توجد مهمة كرون تكتب الحالة دورياً (كافٍ للّوحات، يمكن إضافة cron لاحقاً).
- تطبيق الهجرة على قاعدة البيانات (`prisma migrate deploy`) خطوة نشر منفصلة.

## 8. القرار النهائي

النطاق المطلوب مُنفَّذ بالكامل: جداول + صلاحيات + APIs + شاشات (موبايل
وويب) + لوحات + سجلات append-only + اختبارات خضراء، دون أي تغيير على
المحاسبة أو POS أو منطق الفواتير/الدفع.

## **WORKER WORKFLOW READY**
