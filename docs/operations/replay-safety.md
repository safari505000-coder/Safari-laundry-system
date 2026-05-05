# Replay safety (BullMQ)

## Deduplication keys
- **Discord alerts:** `jobId = \`${event}:${orderId}\`` when `orderId` present (`discord-alert.service.ts`).
- **WhatsApp:** `jobId = payment_confirmed:${orderId}` (`whatsapp-queue.service.ts`).
- **DLQ replay:** increments `replayCount`; capped at 3 per admin replay path (`queue-admin.service.ts`).

## Idempotency expectations
- **Payments / wallet:** enforced inside `finalizePaidOrderFromGateway` / ledger paths (DB constraints + existing guards) — replay of **queue** jobs must not re-run finalize without idempotent order state.
- **Notifications:** re-send may occur once per unique `jobId`; BullMQ rejects duplicate job id on add.

## Verification
```bash
# Redis — inspect job id (example)
# redis-cli -u "$REDIS_URL" --scan --pattern 'bull:discord-alerts:*'
```
