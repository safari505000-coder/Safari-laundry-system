# Runbook — Payment failure handling

> When customers report "I paid but my order is still pending" or
> when the watchdog fires a `captured_payment_not_finalized` /
> `finalize_failed` Discord alert.

## 1. Symptoms

- Discord channel `#alerts-financial` shows
  `captured_payment_not_finalized` or `finalize_failed`.
- `payments_finalize_failure_total` increasing.
- `slo_payment_success_ratio` dropping.
- Customers calling the call-centre saying "I paid but the order
  shows unpaid."
- `Order.posGatewayTrackId` is set but `walletSettledAt` is null
  for > 5 minutes.

## 2. Triage (≤ 5 min)

```bash
# 1. Confirm scope: is this one customer or systemic?
curl -sS "${BASE}/metrics" | rg "payments_finalize_"
curl -sS "${BASE}/health/ready" | jq .

# 2. Check the affected order's status from a read endpoint
curl -sS "${BASE}/api/admin/orders/<orderId>" | jq '{status, walletSettledAt, posGatewayTrackId, posPaymentMethod}'

# 3. Check the gateway's view of the same payment
curl -sS -H "Authorization: Bearer ${UPAYMENTS_TOKEN}" \
  "https://upayments.com/api/v1/get-payment-status/<trackId>" | jq .
```

If the gateway reports `success` but our order is unpaid → containment
step 3.A.

If the gateway reports `failed` / `pending` → containment step 3.B.

If gateway is unreachable → containment step 3.C.

## 3. Containment

### 3.A Gateway captured but our order is unsettled (most common)

Cause: amount-mismatch, watchdog backlog, or a transient finalize
error. Apply the manual recheck:

```bash
# Manual recheck endpoint (idempotent — finalizes if gateway agrees)
curl -sS -X POST "${BASE}/api/payments/recheck/<orderId>" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

If the recheck returns `{ duplicate: true }` → order was finalised
since you started; verify with `/api/admin/orders/<id>` and close
the alert.

If recheck returns an error message about `validateFinalizeGatewayMetadata`
amount mismatch:

- Compare gateway amount minor vs `order.totalPrice` minor.
- Common cause: customer paid 1.000 KD via wrong link or short-paid.
- **Do NOT manually flip the order to COMPLETED.** Either:
  - Have the customer pay the difference via a new link, OR
  - Refund via the gateway and have the customer pay the correct
    amount.

### 3.B Gateway reports failed / pending

- The customer did not actually pay (or payment is still pending).
- No financial action needed. Reassure the customer the order is
  intact at `PENDING`. They can retry the payment link.

### 3.C Gateway unreachable

- The watchdog will retry on its next cycle (usually <2 min).
- Check the UPayments status page for incidents.
- If UPayments is genuinely down: the system continues to accept
  cash + KNET handheld; only KNET online is affected. Communicate
  to the call-centre to push customers towards alternative
  channels.

## 4. Recovery

After containment:

1. Confirm `payments_finalize_failure_total` rate has flattened.
2. Verify a sample of recently-failed orders are now COMPLETED:

   ```bash
   psql "$DATABASE_URL" -c "
     SELECT id, status, \"walletSettledAt\", \"posGatewayTrackId\"
     FROM \"Order\"
     WHERE \"createdAt\" > NOW() - INTERVAL '1 hour'
       AND \"posGatewayTrackId\" IS NOT NULL
     ORDER BY \"updatedAt\" DESC LIMIT 50;
   "
   ```

3. Run reconciliation to confirm no drift introduced:

   ```bash
   curl -sS -X POST "${BASE}/api/finance/reconciliation" \
     -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq .
   ```

4. Verify trial balance still passes
   (`reconciliation.checkTrialBalance.passed === true`).

## 5. Post-incident

- Add the affected `orderIds` to the incident ticket.
- Update the runbook if a new failure mode was found.
- If the watchdog missed the case, file an issue against
  `payment-consistency-watchdog.service.ts`.

## 6. What you must never do

- ❌ Direct `prisma.order.update({ status: COMPLETED })` to "fix" an order.
  **Always** route through the canonical settlement
  (`PaymentsService.finalizePaidOrderFromGateway` or recheck endpoint).
  Settling outside the canonical orchestrator skips the wallet lock,
  the journal write, and reconciliation safeguards.
- ❌ Direct `prisma.journalEntry.create` to "post" the missing journal entry.
  The journal is **only** writeable via `DoubleEntryJournalService.appendBalanced`.
- ❌ Marking an order as paid from the admin UI without verifying the
  gateway agrees. The `validateFinalizeGatewayMetadata` exists to
  prevent this exact mistake.
- ❌ Setting `PAYMENTS_MOCK=true` in production. **Verify it is not set**
  with `env | rg PAYMENTS_MOCK` on every pod.

## 7. Related

- [`../payment-flows.md`](../payment-flows.md) — the canonical payment flows.
- [`../invariants.md`](../invariants.md) — invariants 9, 12, 17 (idempotency, gateway validation).
- [`docs/runbooks/payment-failure.md`](../../runbooks/payment-failure.md) — quick triage card.
- [`reconciliation-drift.md`](./reconciliation-drift.md) — if drift was introduced.
