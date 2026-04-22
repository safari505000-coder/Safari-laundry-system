-- V19.11.3 — Close the KNET cash-trail gap.
--
-- KNET POS sales never pass through the driver's pocket, yet historically
-- they were marked CashStatus.PAID_TO_DRIVER, which made them appear in
-- "cash collected by driver" reports alongside real cash.  Introduce a
-- dedicated PAID_ONLINE state so the two channels are cleanly separated
-- end-to-end (service, handover flow, reports, audit).

ALTER TYPE "CashStatus" ADD VALUE IF NOT EXISTS 'PAID_ONLINE';
