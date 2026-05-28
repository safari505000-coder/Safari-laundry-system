# Safari ERP — Employee Mobile

تطبيق Expo/React Native **معزول بالكامل** عن `web/` و `apps/public-web/` و backend NestJS.

## الهيكل (بدون تداخل)

```text
apps/employee-mobile/
  app/                    # Expo Router — شاشات فقط
    (auth)/login.tsx      # تسجيل دخول
    (app)/
      (driver)/tasks.tsx
      (call-center)/index.tsx
      (manager)/index.tsx
      unsupported.tsx
  src/
    api/                  # HTTP client + auth endpoints
    auth/                 # session + context + role routing
    components/           # UI محلي للتطبيق
    theme/brand.ts        # ألوان سفاري
```

- **لا يلمس** `web/src` ولا `src/` (backend) إلا عند إضافة APIs جديدة لاحقاً (GPS, scan, push).
- **لا ينسخ** منطق مالي — كل KWD من السيرفر.
- **JWT** نفس `/api/auth/login` المستخدم في نظام الويب.

## التشغيل

1. شغّل API محلياً: `npm run dev` (من جذر المشروع).
2. عدّل `app.json` → `extra.apiBaseUrl` أو عيّن:
   ```bash
   EXPO_PUBLIC_API_URL=http://192.168.x.x:3000
   ```
   (استخدم IP الجهاز على الشبكة — `localhost` لا يعمل من الهاتف.)
3. من جذر المشروع:
   ```bash
   npm run employee-mobile:start
   ```
4. امسح QR من Expo Go أو شغّل:
   ```bash
   npm run employee-mobile:android
   ```

## الأدوار المدعومة (Phase 0)

| الدور | الشاشة |
|-------|--------|
| DRIVER | `/(app)/(driver)/tasks` |
| CALL_CENTER / SUPERVISOR | `/(app)/(call-center)` |
| MANAGER / OWNER / GM | `/(app)/(manager)` |
| باقي الأدوار | `/(app)/unsupported` |

## Phase 1 — Driver (✅)

- Dispatch poll + acknowledge
- Tab bar: مهامي · مسح · متابعة · عهدة · POS

## Phase 1b — Driver field ops (✅)

| Tab | API |
|-----|-----|
| **متابعة** | `GET /orders/driver/pending-invoices` (read-only) |
| **عهدة** | `GET /finance/driver/my-cash-custody` + إشعار مدير محلي |
| **POS** | `POST /pos/checkout` (lineItems + تسعير السيرفر) + `GET /system/operating-status` |

## Phase 2 — Call Center (✅)

| Tab | API |
|-----|-----|
| **بحث** | `GET /customers?q=` → ملف عميل |
| **تحصيل** | `GET /orders/collections/unpaid-online` + واتساب |
| **طلبات** | `/public/call-center/website-order-requests` |
| **مدفوعات** | `/public/call-center/website-payments` |

ملف العميل: `collection-debt-breakdown` + رابط دفع الكل/فاتورة عبر واتساب.

## Phase 3 — Manager (✅)

| Tab | API |
|-----|-----|
| **ملخص** | `GET /manager/cash-status` (MANAGER) أو `GET /cash-intelligence/dashboard` (OWNER/GM) |
| **سائقين** | `GET /manager/driver-oversight` + SSoT `GET /cash-intelligence/dashboard` |
| **عهدة** | `GET /manager-custody/mine` + `POST /manager-custody/approve-receipt` (MANAGER) |

## Phase 2b — Full driver POS (✅)

| Feature | API |
|---------|-----|
| **قائمة أسعار** | `GET /laundry-price-list` + categories |
| **عميل** | `GET /pos/customers/search` · `POST /pos/customers` |
| **بيع** | `POST /pos/checkout` (lineItems + `posPaymentMethod` canonical) |

وسائل الدفع في POS مطابقة لعقد السيرفر:

- `CASH`
- `KNET`
- `PAYMENT_LINK`
- `ONLINE`
- `DEBT_ON_ACCOUNT`
- `SUBSCRIPTION`، والسيرفر يحولها داخلياً إلى `SUBSCRIPTION_WALLET`

التطبيق يعرض الإجمالي كمعاينة فقط. التسعير النهائي ورسوم التوصيل وتطبيق المحفظة/الدين كلها من السيرفر.

## Phase 4 — Device layer (✅)

| Capability | Mobile | Backend |
|------------|--------|---------|
| **GPS** | `expo-location` — رفع كل ~30ث | `PATCH /finance/driver/location` |
| **مسح** | تبويب مسح + إدخال يدوي | `GET /orders/:id` |
| **Push** | `expo-notifications` | `POST /public/employee/push-token` |

- استلام المهمة **محجوب** بدون إذن الموقع.
- Push يُسجّل عند الدخول (جهاز حقيقي + EAS `projectId` للإنتاج).

## المراحل القادمة

- E2E tests per `docs/web-mobile-expansion-test-plan.md`
- Production builds (EAS) + push delivery wiring

## Typecheck

```bash
npm run typecheck --prefix apps/employee-mobile
```
