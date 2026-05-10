# V22 Phase 5 — Rollout Guide

**Phase:** V22 Phase 5 (Operator UX Rebuild)
**Audience:** Release engineering + operations team
**Risk class:** **Low** — every change is additive and behind an additive route.

---

## 1. Pre-rollout checklist

Run on the release candidate branch:

```bash
cd web
npx tsc -p tsconfig.app.json --noEmit       # expect: clean
npx vitest run                                # expect: 182/182 (32 files)
npx vite build                                # expect: clean
npx madge --circular --ts-config tsconfig.app.json src  # expect: no circular deps

cd ..
npx tsc -p tsconfig.build.json --noEmit       # expect: clean
npx jest --testPathPatterns="(v21-phase1-core-freeze|v21-phase4-event-bus-integrity|v21-canonical-banking-guards|domain-events)" --silent  # expect: 204/204
```

All checks above PASS as of this commit.

---

## 2. Deployment order

Because every change is additive, the order is flexible. Recommended:

1. **Deploy backend** (no backend changes ship in this phase, so this is a no-op — but verify the existing `/api/realtime/financial/:channel/stream` endpoint is reachable in the target environment).
2. **Deploy frontend** (`web/dist/`).
3. **Smoke-test** the four wired surfaces (see §3).
4. **Announce** the new `/cc/customers/:customerId/360` route to the CC team.

---

## 3. Post-deploy smoke test

A 5-minute manual checklist for one CC operator:

| # | Action | Expected |
| --- | --- | --- |
| 1 | Log in as a `CALL_CENTER` user | Dashboard loads |
| 2 | Open browser DevTools → Network → filter "stream" | After landing on `/cc/dashboard`, exactly one open SSE stream `/api/realtime/financial/dashboards/stream?...` |
| 3 | Click any customer in the worklist | Land on `/cc/customers/:id`. SSE stream switches to `/api/realtime/financial/customer360/stream?customer=:id` |
| 4 | Edit the customer in another tab (e.g. block / unblock) | Within 5 seconds, the original tab's Customer360 reflects the change WITHOUT a page reload |
| 5 | Replace the URL with `/cc/customers/:id/360` | The new V22 v2 page loads. Layout is 3-pane with sticky action bar at the bottom. |
| 6 | Press `Alt+P` | Action bar's "Pay" button activates (currently navigates to v1 to use the dialog) |
| 7 | Press `Alt+S` | "Next customer" button activates → navigates back to dashboard |
| 8 | Navigate to `/cc/collections-report` (live collections page) | SSE stream `/api/realtime/financial/collections/stream` opens |
| 9 | Mark an order paid in a different tab | The collections page refreshes the row within 5 seconds |
| 10 | Inspect the Customer360 v1 page | Same SSE behavior (channel `customer360`) — v1 also adopted the feed |

If any check fails, see §5 for rollback.

---

## 4. Operator announcement (suggested copy, AR)

> **تحديث V22 — مركز عمليات العميل (Customer360 v2)**
>
> أضفنا تحديثاً مباشراً لكل صفحات العميل: عند تعديل بيانات العميل من زميل آخر، ستظهر التحديثات لديك خلال ٥ ثوانٍ بدون الحاجة لإعادة التحميل.
>
> كذلك يتوفر الآن عرض جديد بثلاث لوحات للعميل عبر الرابط:
> `/cc/customers/<معرّف العميل>/360`
>
> اختصارات لوحة المفاتيح في العرض الجديد:
> * `Alt+P` تسجيل دفعة
> * `Alt+N` إضافة ملاحظة
> * `Alt+D` إنشاء مهمة
> * `Alt+C` جدولة معاودة الاتصال
> * `Alt+S` العميل التالي
>
> العرض القديم لا يزال يعمل كما هو — العرض الجديد إضافي وقابل للتراجع بنقرة واحدة من فريق التطوير.

---

## 5. Rollback

See `docs/v22-phase5-rollback-guide.md` for the per-wave rollback procedure. Summary:

* **Full rollback:** `git revert <v22-phase5-commit>` — restores the previous main bundle.
* **Disable just SSE without removing the page:** add `?nosse=1` query param support in the next minor release (V23.0 backlog item `RB-V22-1`). This phase does NOT ship that switch — the only kill switch is the full revert.
* **Disable just v2 page:** delete the `/cc/customers/:customerId/360` route from `App.tsx` and rebuild. v1 + SSE wires stay live.

---

## 6. Operational metrics to monitor

For the first 7 days after rollout, watch:

| Metric | Source | Healthy band | Alert |
| --- | --- | --- | --- |
| SSE connection count per session | `RealtimeMetricsService.snapshotChannel(*)` | 1–4 per operator | > 8 → investigate |
| SSE reconnect rate | Same | < 1 reconnect per 30-minute session | > 3 reconnects/session → investigate |
| Cache invalidation per minute per channel | Same | Within historical baseline | 10× baseline → investigate |
| `/cc/customers/:customerId/360` hit count | Web analytics | Slow ramp (operators discover it) | Spike or drop to zero → investigate |
| Page-level error rate | Sentry / browser console | < 0.1 % per session | > 1 % → investigate |

V23 will add a dedicated `OBS-V22-1` dashboard tile for the v2 vs v1 adoption ratio.

---

## 7. Files touched

### Added
* `docs/v22-phase5-rollout-guide.md` (this file).
