# Worker Role Workflow — تشغيل رتبة العامل

> طبقة الإنتاج (Production Worker Layer) تفعّل رتبة `WORKER` الموجودة أصلاً
> في النظام وتحوّلها إلى وظيفة تشغيلية حقيقية لإدارة دورة القطعة داخل المغسلة.
> **إضافة تشغيلية بحتة** — لا تمسّ المحاسبة ولا POS ولا منطق الفواتير/الدفع.

## 1. نطاق العامل

العامل يتعامل **فقط** مع:

- القطع المسندة له + طابور مرحلته في فرعه
- قبول المهمة / بدء المهمة / إنهاء المهمة
- الإبلاغ عن خلل
- إضافة ملاحظة داخلية
- عرض Timeline محدود وآمن للقطع المسندة له

العامل **لا** يتعامل مع: المحاسبة، الفواتير، الإيداعات، العهد، العملاء،
التقارير المالية، الصلاحيات، أو أي بيانات لعمّال/فروع أخرى.

## 2. أنواع العمال

لا توجد Roles جديدة. نوع العمل يُحدَّد عبر **صلاحيات specialisation** على نفس
رتبة `WORKER`:

| Permission | المعنى |
| --- | --- |
| `production.washing` | عامل غسيل |
| `production.drying` | عامل تجفيف |
| `production.ironing` | عامل كي |
| `production.packing` | عامل تغليف |
| `production.qc` | عامل فحص جودة |

جميعها تتضمّن ضمنياً `production.work`. كما يمكن تخصيص قطعة لعامل بعينه عبر
`Garment.assignedWorkerId` (إعادة التوجيه من المدير).

## 3. دورة القطعة (Garment Lifecycle)

تُتعقّب كل قطعة عبر جدول `Garment` (مرتبط بـ `orderId` و`orderLineItemId`
الاختياري و`branchId`).

```
RECEIVED → SORTING → WASHING → DRYING → IRONING → PACKING → QC_CHECK → READY → DELIVERED
```

مراحل الاستثناء (خارج المسار الطبيعي):
`QUALITY_HOLD`, `REWORK`, `REPAIR`, `DAMAGED_REVIEW`, `LOST_REVIEW`.

المراحل القابلة للعمل (يظهر لها طابور للعامل): `SORTING, WASHING, DRYING,
IRONING, PACKING, QC_CHECK`.

## 4. تدفق المهمة (Task Status)

```
WAITING_NEXT_STAGE → ACCEPTED_BY_WORKER → IN_PROGRESS → COMPLETED
```

| فعل | API | الانتقال | الحقول المسجّلة |
| --- | --- | --- | --- |
| Accept | `POST /worker/tasks/:id/accept` | WAITING → ACCEPTED_BY_WORKER | `acceptedAt`, `acceptedByUserId`, `assignedWorkerId` |
| Start | `POST /worker/tasks/:id/start` | ACCEPTED → IN_PROGRESS | `startedAt` |
| Complete | `POST /worker/tasks/:id/complete` | IN_PROGRESS → (next stage) WAITING | `completedAt`, `WorkerProductionLog`, handoff |
| Report Issue | `POST /worker/tasks/:id/report-issue` | * → QUALITY_HOLD | `GarmentIssue`, `GarmentStageEvent`, `AuditLog` |
| Add Note | `POST /worker/tasks/:id/note` | (no transition) | `internalNotes` |

### قواعد العمل (Business Rules)

1. لا يمكن **Start** بدون **Accept** سابق.
2. لا يمكن **Complete** لمهمة ليست `IN_PROGRESS`.
3. لا يكمل القطعة إلا العامل الذي قبِلها (`acceptedByUserId`).
4. قطعة عليها Issue مفتوح **لا** يمكن إكمالها / لا تصل `READY`.
5. لا يرى العامل مهام عامل آخر، ولا يتعامل مع قطعة من فرع آخر.
6. كل انتقال يُسجّل `GarmentStageEvent` (append-only).

## 5. شاشة العامل

- **الموبايل (التجربة الأساسية):** `apps/employee-mobile` →
  `/(app)/(worker)/tasks`. تعرض: المرحلة المطلوبة، رقم الطلب، نوع الخدمة
  (NORMAL/EXPRESS)، الوقت المتوقع، هل متأخرة، الملاحظات الداخلية، وأزرار
  Accept / Start / Complete / Report Issue.
- **الويب (دعم/معاينة للمدير):** `/worker/tasks` (محمي بصلاحية
  `production.view`).

## 6. الصلاحيات

| Role | production.view | production.work | production.manage |
| --- | :---: | :---: | :---: |
| WORKER | ✓ | ✓ | ✗ |
| MANAGER | ✓ | ✗ | ✓ |
| SUPERVISOR | ✓ | ✗ | ✗ |
| GENERAL_MANAGER | ✓ (read-only) | ✗ | ✗ |
| OWNER | ✓ | ✓* | ✓ |

`WORKER` لا يملك أي صلاحية مالية/فواتير/نقد/عملاء — راجع
[PRODUCTION_ROLE_VISIBILITY_MATRIX](./PRODUCTION_ROLE_VISIBILITY_MATRIX.md).
