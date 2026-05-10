-- V20.2 — Phase 27: seed the dedicated WALLET_LIABILITY account.
--
-- The wallet absorption journal entry was previously written as
-- DR ADJUSTMENTS (5100) / CR REVENUE (4100) (V20.1-v4 Phase 20),
-- chosen as a temporary placeholder because no liability account
-- existed for prepaid wallet credit. V20.2 introduces account 2100
-- so the absorption can be DR WALLET_LIABILITY / CR REVENUE — i.e.
-- the wallet credit (a liability we owed the customer) is reduced
-- and the equivalent service value is recognised as revenue.
--
-- NOTE on the v20.2 prompt's literal wording (DR WALLET_LIABILITY /
-- CR ACCOUNTS_RECEIVABLE): our INVOICE_SHORTFALL row already carries
-- the *post-wallet remainder* (e.g. 15 of a 20 KD invoice when wallet
-- absorbed 5), so AR is never debited for the wallet portion in the
-- first place. Crediting AR by the wallet portion would therefore
-- push journal AR below the DebtLedgerEntry net and trip the
-- Phase 29 lockstep on every wallet absorption. We keep the credit
-- on REVENUE (revenue recognition is still correct) and reserve the
-- DR WALLET_LIABILITY / CR AR shape for a future migration that
-- changes the SHORTFALL semantic to gross-invoice + separate
-- AR-issuance entry.
--
-- Idempotent: ON CONFLICT keeps existing rows from earlier seeds.

INSERT INTO "Account" ("code", "name", "type")
VALUES ('2100', 'WALLET_LIABILITY', 'LIABILITY')
ON CONFLICT ("code") DO NOTHING;
