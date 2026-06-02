# Production Role Visibility Matrix — مصفوفة الرؤية حسب الدور

ما الذي يراه/يفعله كل دور في طبقة الإنتاج. تُفرض عبر `RolesGuard` على
الـ controllers + فحوص النطاق (branch/ownership) داخل `ProductionService`.

## ما يراه كل دور

| القدرة | WORKER | MANAGER | SUPERVISOR | CALL_CENTER | OWNER / GM |
| --- | :---: | :---: | :---: | :---: | :---: |
| مهامه فقط (own tasks) | ✓ | — | — | — | — |
| طابور مرحلته في فرعه | ✓ | — | — | — | — |
| Timeline آمن للقطعة (بدون لوم) | ✓ | — | — | — | — |
| لوحة إنتاج الفرع | ✗ | ✓ (فرعه) | ✓ | ✗ | ✓ (كل الفروع) |
| كل العمال في الفرع + سجلاتهم | ✗ | ✓ | ✓ | ✗ | ✓ |
| التأخيرات / الاختناقات | ✗ | ✓ (فرعه) | ✓ | حالة عميل فقط | ✓ (كل الفروع) |
| المشاكل (Issues queue) | ✗ | ✓ (فرعه) | ✓ | ✗ | ✓ |
| Timeline كامل + الأفعال + الأسماء | ✗ | ✓ (فرعه) | ✓ | ✗ | ✓ |
| حالة الطلب الآمنة للعميل | ✗ | ✓ | ✗ | ✓ | ✓ |
| KPIs بين الفروع / lost & damaged | ✗ | ✗ | جزئي | ✗ | ✓ |

## ما يفعله كل دور

| الفعل | API | المسموح لهم |
| --- | --- | --- |
| Accept/Start/Complete/Report/Note | `/worker/tasks/*` | WORKER (+ OWNER للدعم) |
| Garment intake | `POST /production/garments` | MANAGER, OWNER |
| Decision على Issue | `POST /production/issues/:id/decision` | MANAGER (فرعه), OWNER |
| Reassign task | `POST /production/tasks/:id/reassign` | MANAGER (فرعه), OWNER |
| Board / Issues / Timeline / Worker logs | `GET /production/*` | MANAGER, SUPERVISOR, GM, OWNER |
| Owner dashboard | `GET /production/owner/dashboard` | OWNER, GM |
| Customer status | `GET /production/orders/:id/customer-status` | CALL_CENTER(+SUP), MANAGER, GM, OWNER |

## ما لا يراه العامل (تأكيد أمني)

`WORKER` **لا** يملك أيّاً من: `invoices.view`, `cash.view`, `debts.view`,
`reports.financial.view`, `customers.view`, `expenses.approve`,
`production.manage`, `users.manage`. (مُختبَر في
`src/production/production.service.spec.ts`).

## الكول سنتر — حماية العميل

`getCustomerOrderStatus` تُرجع فقط: المرحلة العامة، هل متأخر، هل يحتاج
انتباه، وملاحظة لطيفة للعميل. **لا** أسماء عمّال، **لا** لوم، **لا** تفاصيل
تأديبية أو تعويضية.
