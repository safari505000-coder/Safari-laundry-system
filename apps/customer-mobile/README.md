# Safari ERP — Customer Mobile

تطبيق Expo/React Native للعملاء — **معزول** عن `web/` و `employee-mobile/`.

## الميزات (v1.0)

| Tab | الوظيفة |
|-----|---------|
| **الرئيسية** | كل خدمات ERP مجمّعة حسب التصنيف + بحث + فروع |
| **السلة** | اختيار قطع متعددة → `requestedItems` + مندوب/فرع + سرعة |
| **طلباتي** | متابعة timeline + push |
| **حسابي** | OTP واتساب · فواتير · دفع UPayments |

## السلة والخدمات

- **كل** عناصر `laundryPriceListItem` النشطة من `GET /public/catalog`
- أسعار: عادي · سريع · كي (إن وُجد)
- السلة ترسل `requestedItems[]` مع الطلب إلى `POST /public/orders/request`
- 4 فروع: الجهراء · الرقعي · صباح السالم · الفروانية

## APIs

| Feature | Endpoint |
|---------|----------|
| Catalog | `GET /public/catalog` |
| Order | `POST /public/orders/request` |
| OTP | `POST /public/customer-auth/request-otp` |
| Verify | `POST /public/customer-auth/verify-otp` |
| Portal | `GET /public/customer-portal/me` |
| Track | `GET /public/orders/requests?phone=` |
| Push | `POST /public/customer/push-token` |
| Pay | `POST /public/customer-portal/payment-link` |

## التشغيل المحلي

```bash
npm run dev                          # API
npm run customer-mobile:start        # Expo
EXPO_PUBLIC_API_URL=http://192.168.x.x:3000/api npm run customer-mobile:start
```

## بناء الإنتاج (EAS)

```bash
cd apps/customer-mobile
eas login
eas build --platform android --profile production
eas build --platform ios --profile production
```

Env في `eas.json`: `EXPO_PUBLIC_API_URL=https://safariomni.com/api`

## Typecheck

```bash
npm run customer-mobile:typecheck
```

## Integration tests

```bash
npx jest --config jest.integration.config.js --runInBand src/test/public-api/mobile-api.smoke.integration-spec.ts
```
