# Web and Mobile Integration Decisions

## Company identity

- Name: مجموعة مصابغ سفاري السريعة.
- Public phone: `22200299`.
- Branches:
  - سفاري الجهراء
  - سفاري الرقعي
  - سفاري صباح السالم
  - سفاري الفروانية
- Logo source: use the existing invoice/system logo assets. The current public web skeleton uses the existing `safari-favicon.svg` mark as a temporary brand mark until final invoice logo extraction is wired.

## Official colors

- Primary blue: `#2D5BEE`
- Dark blue: `#2448C8`
- Cyan: `#5FE7F3`
- Light cyan: `#8EF5FF`
- Gray background: `#EAEAEA`
- Gradient: `#2448C8 -> #2D5BEE -> #5FE7F3`

## Website content

- Services are read dynamically from the current ERP price list.
- Prices are displayed fully and directly to customers.
- About/company/how-it-works text is temporary and can be replaced later without changing the financial API.

## Payment

- Gateway target: UPayments.
- Customer payment permissions:
  - Pay an existing invoice.
  - Request a new service and later pay through a backend-generated payment link.
- Rule: no public web, customer mobile, or employee mobile screen calculates or settles money locally.
- Any payment operation must call a protected backend endpoint that writes through the existing ERP journal/payment flow.

## Customer authentication

- Target: WhatsApp OTP.
- Current state: infrastructure placeholder only; OTP is not active yet.
- Temporary mode: phone-based portal preview for local testing.
- Before launch, customer portal reads must require OTP/session and must not expose another customer's data.

## Customer mobile

- Build as a real React Native / Expo app.
- Notifications: Expo Notifications.
- Reuse `packages/shared-api` contracts.
- Payment links open from backend-generated UPayments intents.

## Employee mobile

- Build as a real React Native / Expo app.
- Roles: driver, call center, manager.
- GPS is mandatory for driver workflows.
- Scan supports QR/Barcode for invoice or order lookup/status updates.
- Driver financial permissions remain exactly as current ERP permissions; no new financial authority is introduced in the mobile app.

## Safety

- Additive file structure only.
- Public/mobile APIs are separate from internal admin pages.
- Backend remains source of truth for orders, payments, subscriptions, debt, and journal entries.
- Existing ERP finance logic is reused instead of copied.
