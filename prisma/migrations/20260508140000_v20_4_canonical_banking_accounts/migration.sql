-- V20.4 — FINAL CANONICAL BANKING CORE.
--
-- Phase 1 (Legacy Writer Elimination) requires three new accounts so
-- previously-untracked money movements (subscription refunds, plan
-- sale on account, debt discounts, invoice cancellation) can be
-- written as proper double-entry entries instead of bypassing the
-- journal.
--
-- All seeds are ON CONFLICT DO NOTHING — idempotent, safe to re-run.
-- No destructive changes.

INSERT INTO "Account" ("code", "name", "type")
VALUES
  -- 4200 — REVENUE_RETURNS (contra-revenue).
  -- Used when an invoice is canceled or refunded to reverse the
  -- original CR REVENUE entry without polluting the gross REVENUE
  -- account. UI/dashboards display "Net Revenue = REVENUE − REVENUE_RETURNS".
  ('4200', 'REVENUE_RETURNS', 'REVENUE'),

  -- 5200 — DEBT_DISCOUNTS (expense — goodwill writedowns).
  -- Used when the call-center grants a discount that wipes a portion
  -- of an outstanding receivable. Distinct from 5100 ADJUSTMENTS so
  -- the goodwill cost is auditable on its own line.
  ('5200', 'DEBT_DISCOUNTS', 'EXPENSE'),

  -- 5300 — PROMOTIONAL_EXPENSE (subsidy / gift recognition).
  -- Used when a subscription activation grants gift credit beyond
  -- the customer-paid portion. The gift portion is an expense to
  -- the company; the customer-paid portion stays in WALLET_LIABILITY.
  ('5300', 'PROMOTIONAL_EXPENSE', 'EXPENSE')
ON CONFLICT ("code") DO NOTHING;
