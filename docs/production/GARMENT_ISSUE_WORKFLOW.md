# Garment Issue Workflow — الإبلاغ عن الخلل والقرارات

إذا وجد العامل خللاً، **لا يضغط Complete** بل **Report Issue**. تتوقف القطعة
عن الانتقال الطبيعي وتُحوَّل للمدير / QC.

## أنواع الخلل (`GarmentIssueType`)

`STAIN_REMAINING`, `BURN_MARK`, `TEAR`, `MISSING_BUTTON`, `COLOR_DAMAGE`,
`WRONG_ITEM`, `MISSING_ITEM`, `BAD_SMELL`, `OTHER`.

## ماذا يحدث عند البلاغ (`reportIssue`)

داخل معاملة واحدة (transaction):

1. إنشاء `GarmentIssue` (status = `OPEN`) مع `reportedByUserId`, `stage`,
   `previousStage`, `previousActorUserId` (العامل السابق المُحتمَل المسؤول).
2. تحديث القطعة: `currentStage = QUALITY_HOLD`, `taskStatus = QUALITY_HOLD`,
   `hasOpenIssue = true`، وتحرير العامل الحالي.
3. إضافة `GarmentStageEvent` (action = `ISSUE_REPORTED`) — append-only.
4. إضافة `WorkerProductionLog` (`issueReported = true`,
   `issueAttributedToUserId`).
5. تسجيل `AuditLog` (`GARMENT_ISSUE_REPORTED`).

> **قاعدة صارمة:** ممنوع أن تصل القطعة `READY` ولديها Issue مفتوح
> (`hasOpenIssue` يمنع `completeTask`، و`APPROVE_AS_READY` يرفض إن بقيت بلاغات
> أخرى مفتوحة).

## حالات البلاغ (`GarmentIssueStatus`)

`OPEN → UNDER_REVIEW → REWORKING → (REPAIRED | DAMAGED | LOST) → CLOSED`.

## قرار المدير / QC (`decideIssue`)

API: `POST /production/issues/:id/decision` — مسموح لـ `MANAGER` (فرعه) و
`OWNER` فقط.

| القرار | المرحلة التالية | حالة البلاغ | يعود للطابور؟ |
| --- | --- | --- | --- |
| `REWASH` | WASHING | REWORKING | ✓ |
| `REIRON` | IRONING | REWORKING | ✓ |
| `REPAIR` | IRONING | REWORKING | ✓ |
| `APPROVE_AS_READY` | READY | CLOSED | ✗ (يتطلب عدم وجود بلاغات أخرى مفتوحة) |
| `ESCALATE_TO_OWNER` | QUALITY_HOLD | UNDER_REVIEW | ✗ |
| `MARK_DAMAGED` | DAMAGED_REVIEW | DAMAGED | ✗ |
| `MARK_LOST` | LOST_REVIEW | LOST | ✗ |

كل قرار يسجّل `ProductionDecision` بـ: `decidedByUserId`, `decision`, `notes`,
`nextStage`, `customerContactRequired`, `compensationRequired`، بالإضافة إلى
`GarmentStageEvent` (`REWORK_SENT` أو `DECISION_MADE`) و`AuditLog`
(`GARMENT_DECISION_MADE`). بعد كل قرار يُعاد احتساب `hasOpenIssue`.
