# Web and Mobile Expansion Test Plan

This checklist protects the existing Safari ERP finance and operations flows while adding:

- Public company website.
- Customer portal/mobile app.
- Employee mobile app.

Branding and integration decisions are documented in
`docs/web-mobile-integration-decisions.md`.

## Backend API smoke tests

- `GET /api/public/catalog` returns active public services and KWD strings.
- `GET /api/public/catalog` returns company phone, branches, and official colors.
- `POST /api/public/orders/request` accepts a valid Kuwait phone and returns `RECEIVED`.
- `POST /api/public/orders/request` rejects invalid phone numbers.
- `POST /api/public/customer-auth/request-otp` returns an OTP-pending envelope without leaking private data.
- `GET /api/public/customer-portal?phone=...` returns only that customer projection.
- `GET /api/public/employee/tasks` requires staff JWT auth.
- Driver token sees only assigned/non-completed tasks.
- Manager/call-center token sees permitted task feed based on role.
- `POST /api/public/payments/:orderId/intent` remains unavailable until gateway flow is explicitly wired.

## Customer website tests

- Home page renders services, order request, and portal sections.
- Catalog loads from `/api/public/catalog`.
- Catalog displays the full active ERP price list, not a hard-coded subset.
- Header shows `22200299` and official branch names are visible.
- Order form submits to `/api/public/orders/request`.
- Portal lookup displays recent orders and canonical KWD strings.
- API failure states show safe user messages.
- Mobile responsive layout works on small screens.

## Customer mobile tests

- Phone OTP flow.
- WhatsApp OTP stays disabled until a provider is approved.
- Order request.
- Order tracking.
- Invoice list.
- Payment link open.
- Subscription balance display.
- Push notification opt-in.

## Employee mobile tests

- Staff login.
- Driver task list.
- Driver task details.
- GPS permission handling.
- Driver GPS permission is mandatory before field task actions.
- QR/barcode scan fallback for manual invoice lookup.
- Cash/KNET collection uses protected backend endpoints only.
- Call-center debt follow-up does not duplicate payment links.
- Manager sees task exceptions and driver status.

## Financial guard tests

- No frontend/app calculates KWD totals.
- All KWD values come from API as canonical strings.
- Payment link creation happens in backend only.
- UPayments intent creation is the only approved gateway path.
- Cash/KNET collection writes through existing ERP payment flow.
- Subscription wallet still requires active subscription.
- Partial subscription wallet consumption leaves remaining AR debt.
- Every external payment creates one `EXTERNAL_PAYMENT` journal entry.
- Public/mobile API cannot mutate journal or ledger directly.

## Launch readiness

- Backend build passes.
- Public website build passes.
- Existing internal admin web build passes.
- Focused financial integration tests pass.
- Browser E2E covers public order request and customer portal.
- Android/iOS builds are produced only after API auth and notifications are finalized.
