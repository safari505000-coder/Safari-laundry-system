# Stage Handoff SLA — تسليم المراحل والتأخير

عند **إنهاء** عامل لمرحلة، تنتقل القطعة إلى المرحلة التالية بحالة
`WAITING_NEXT_STAGE` ويبدأ عدّاد انتظار. إذا لم يقبلها عامل المرحلة التالية
خلال مهلة الـ SLA، تُعتبر متأخرة.

## مهلة الـ SLA

| الخدمة | مهلة قبول المرحلة (handoff) | مهلة الجاهزية الكلية (ready) |
| --- | --- | --- |
| `NORMAL` | 30 دقيقة | 48 ساعة |
| `EXPRESS` | 15 دقيقة | 4 ساعات |

المصدر: `src/production/garment-stage.machine.ts` →
`handoffSlaMinutes()` / `readySlaMinutes()`.

## الحقول المتعقَّبة (على `Garment`)

`handoffFromStage`, `waitingSince`, `expectedAcceptBy`, `acceptedAt`,
`acceptedByUserId`, `assignedWorkerId`, `handoffStatus`, `delayMinutes`.

حالات `handoffStatus`:
`WAITING_NEXT_STAGE`, `ACCEPTED_BY_NEXT_WORKER`, `DELAYED_HANDOFF`, `ESCALATED`.

## قواعد احتساب التأخير

1. **العامل السابق لا يتحمّل التأخير بعد ضغط Complete بنجاح.** عند Complete
   يُصفَّر `acceptedByUserId` و`assignedWorkerId` و`delayMinutes` للقطعة،
   وتدخل طابور المرحلة التالية بـ `expectedAcceptBy = الآن + SLA`.
2. التأخير يُحسب على **المرحلة التالية**.
3. إذا كان هناك عامل محدّد (`assignedWorkerId`) للمرحلة التالية → يُنسب إليه
   عند القبول المتأخر (`delayMinutes` يُحسب من `expectedAcceptBy`).
4. إذا لا يوجد عامل محدّد → يُنسب لطابور المرحلة / مدير الفرع (يظهر في لوحة
   المدير ضمن `delayedGarments`).
5. عند **القبول**: إذا `now > expectedAcceptBy` تُسجّل `delayMinutes` على
   العامل الذي قبِل، وتتحوّل `handoffStatus → ACCEPTED_BY_NEXT_WORKER`.

## الرؤية حسب الدور

| Role | ما يراه عن التأخير |
| --- | --- |
| WORKER | حالة مهامه فقط (متأخر/في الوقت) — **بدون لوم** الآخرين |
| MANAGER | كل تأخيرات **فرعه** (`getBoard` → `delayedList`) |
| SUPERVISOR | الاختناقات حسب المرحلة عبر كل الفروع |
| OWNER / GM | مؤشرات التأخير بين المراحل لكل الفروع (`getOwnerDashboard` → `bottlenecks`, `delayedHandoffs`) |
| CALL_CENTER | حالة آمنة للعميل فقط: "قيد التجهيز / قد يتأخر قليلاً" — بدون أسماء أو لوم |

دالة `isLate(garment, now)` (في `production.service.ts`) هي المصدر الموحّد
لاحتساب التأخّر في كل اللوحات.
