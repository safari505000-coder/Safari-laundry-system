# Worker Production Logs — السجلات الدائمة (Append-Only)

كل حركة في طبقة الإنتاج تُسجَّل في سجلات دائمة. الجداول التالية **append-only
بحكم الاستخدام** — الخدمة تُنشئ فقط (`create`) ولا تُحدّث/تحذف أحداث
الـ timeline (مُختبَر).

## 1. `GarmentStageEvent` — كل حركة للقطعة

| الحقل | الوصف |
| --- | --- |
| `garmentId`, `orderId`, `branchId` | مراجع القطعة/الطلب/الفرع |
| `fromStage`, `toStage` | الانتقال |
| `actorUserId` | من نفّذ (أو null للنظام) |
| `action` | الفعل (انظر أدناه) |
| `notes` | ملاحظة/نوع الخلل/القرار |
| `createdAt` | الطابع الزمني |

الأفعال (`GarmentStageAction`): `ACCEPTED`, `STARTED`, `COMPLETED`,
`HANDED_OFF`, `DELAYED`, `ISSUE_REPORTED`, `DECISION_MADE`, `REWORK_SENT`,
`READY_MARKED`.

> **Timeline append-only:** لا يوجد مسار update/delete لهذا الجدول في
> الخدمة. اختبار `the stage-event store is append-only` يتأكد من ذلك.

## 2. `WorkerProductionLog` — أداء العامل

| الحقل | الوصف |
| --- | --- |
| `userId`, `branchId`, `stage` | العامل/الفرع/المرحلة |
| `garmentId`, `orderId` | المرجع |
| `action` | `COMPLETED` أو `ISSUE_REPORTED` |
| `startedAt`, `completedAt`, `durationMinutes` | مدة العمل |
| `issueReported` | هل بلّغ عن خلل |
| `issueAttributedToUserId` | العامل السابق المُحتمَل المسؤول (إن وجد) |
| `createdAt` | الطابع الزمني |

يُستهلك في `GET /production/workers/:id/logs`:
`totalTasks`, `issuesReported`, `avgDurationMinutes`، وقائمة السجلات.

## 3. `GarmentIssue` — تفاصيل الخلل

`garmentId`, `orderId`, `branchId`, `reportedByUserId`, `stage`,
`previousStage`, `previousActorUserId`, `issueType`, `status`, `notes`,
`photoUrl?`, `createdAt`, `closedAt`. الحالات:
`OPEN, UNDER_REVIEW, REWORKING, REPAIRED, DAMAGED, LOST, CLOSED`.

## 4. `ProductionDecision` — قرارات المدير/QC

`issueId`, `garmentId`, `orderId`, `decidedByUserId`, `decision`, `notes`,
`nextStage`, `customerContactRequired`, `compensationRequired`, `createdAt`.

## 5. `AuditLog` (الجدول المركزي الموجود)

تُكتب إدخالات لكل حدث حسّاس: `GARMENT_INTAKE`, `GARMENT_ISSUE_REPORTED`,
`GARMENT_DECISION_MADE`, `GARMENT_TASK_REASSIGNED` — عبر `AuditLogsService`،
دون أي مساس بالسجل المحاسبي/المالي.
