# Proposal — `Order.createdByUserId` + `Order.createdByRole` (deferred)

> **Status**: PROPOSAL ONLY. No schema migration has been applied. The
> rest of the SSoT lockdown (branch ledger, drift audit, write police,
> canonical audit emit) was shipped without this change. This document
> exists so the schema change can be reviewed independently before it
> touches the database.

## 1. Why this is needed (real gap, not a hypothesis)

Today's `Order` schema has `driverId` (the assigned holder of the
cash) but no column that records **who actually opened the invoice**.
Every order-create path in `src/orders/orders.service.ts` collapses
the actor and the driver into the same person:

```ts
// src/orders/orders.service.ts (createQuick)
return tx.order.create({
  data: { driverId: driverUserId, /* ... */ },
});
this.auditOrderCreated(order, driverUserId);  // actor == driver
```

This works as long as the driver is the only role that ever opens an
invoice. The new model explicitly requires:

> **Manager creates invoice → assigns to driver.**
> Cash is recorded under the driver (holder), and the manager is
> recorded as the actor (audit trail).

That separation cannot be expressed today because there is nowhere on
`Order` to store the manager's user id.

**Crucially**, this is the *only* part of the brief's "invoice
ownership bug" that is real — the v2 cash chain already attributes
cash to the assigned driver via `Order.driverId` and propagates it
through `handoverShiftId → ManagerCashCustody.branchId → BankDepositLog`,
so cash flow is already correct. What is missing is the durable
audit trail of operator identity at order creation time.

## 2. Schema change

```prisma
model Order {
  // ... existing fields ...

  /**
   * SSoT actor (audit trail) — the user who *opened* this invoice.
   * Distinct from `driverId` (the assigned cash holder) so a manager
   * can create an invoice on behalf of a driver without becoming the
   * cash owner. Nullable for backfill compatibility; new rows MUST
   * populate it.
   */
  createdByUserId String?    @db.Uuid
  /**
   * Role snapshot at create time (denormalised so the audit trail
   * survives later role changes). Free-form String to mirror the
   * AuditLog.role column convention; values are SafariRole names.
   */
  createdByRole   String?

  createdBy       User?      @relation("OrderCreatedBy", fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@index([createdByUserId])
}

model User {
  // ... existing relations ...
  ordersCreated   Order[]    @relation("OrderCreatedBy")
}
```

Both columns are **nullable** so the migration is non-blocking on
existing rows. A subsequent backfill (Section 4) populates legacy
rows where the actor can be inferred safely.

## 3. Rollout plan

| Phase | Step | Reversible? |
|---|---|---|
| 0 | This proposal merged | Yes |
| 1 | Apply Prisma migration (add nullable columns + index + relation) | Yes (drop columns) |
| 2 | Wire create paths to populate the new columns from `JwtUser` | Yes (revert PR) |
| 3 | Backfill: legacy rows where the original `auditOrderCreated` AuditLog row carries an actor → copy `userId` + `role` onto the order | Yes (re-run with `null`s) |
| 4 | Add a 30-day soak window. The `IntegrityAuditService` gains a check: any `Order` newer than the soak window with `createdByUserId IS NULL` is a SSoT violation | N/A (read-only check) |
| 5 | After soak: migration tightens the columns to `NOT NULL` for new rows only (or moves to a CHECK constraint that only applies to `createdAt > <cutoff>`) | One-way after this point |

## 4. Backfill strategy (deterministic, safe)

```sql
-- Pseudo-SQL; the real backfill should be a one-shot Node script that
-- reads in batches of 1000 rows and writes inside a transaction.

UPDATE "Order" o
SET    "createdByUserId" = al."userId",
       "createdByRole"   = al."role"
FROM   "audit_logs" al
WHERE  al."orderId" = o.id
  AND  al."action"  = 'ORDER_CREATED'
  AND  o."createdByUserId" IS NULL
  AND  al."userId" IS NOT NULL;
```

Rows that have **no** matching `ORDER_CREATED` audit log row are left
untouched — those legacy rows simply have no audit trail to recover,
and inventing one would be worse than the absence.

## 5. Code-path wiring (Phase 2)

Every order-create site in the codebase needs the same minimal
change: accept the JWT user and pass `userId` + `role` into the Prisma
`create` payload AND into the `auditOrderCreated` call.

Known call sites (verified via grep `auditOrderCreated`):

- `OrdersService.createQuick(driverUserId, dto)` — currently uses
  `driverUserId` as actor. Change to also accept `currentUser: JwtUser`
  and write `createdByUserId: currentUser.userId, createdByRole: currentUser.role`.
- `OrdersService.posCheckout(driverUserId, dto)` — same change.
- `OrdersService` private merge / batch helpers — propagate the actor
  param down through the helper signatures.
- All controller-level callers in `src/orders/orders.controller.ts`
  must inject `@CurrentUser() user: JwtUser` and forward it.

**Anti-pattern to avoid**: do NOT default `createdByUserId` to
`driverUserId` when the JWT actor is missing. A null actor is more
honest than a fabricated one — the SSoT cron will surface it as a
WARNING and an engineer can investigate.

## 6. Audit log enrichment (Phase 2, in the same PR)

`AuditLogsService.logFinancialEvent` already accepts a `role` field;
the existing `ORDER_CREATED` emit in `OrdersService.auditOrderCreated`
does NOT pass it. Add `role: actorRole` alongside the new
`createdByUserId` plumbing so the audit row matches the new column.

## 7. Test plan

1. **Unit**: `Order` create with `createdByUserId === driverId` (single
   actor case) and with `createdByUserId !== driverId` (manager-as-
   actor case) both round-trip correctly.
2. **Integration**: hit `POST /orders/quick` as a `MANAGER` JWT and
   assert the new row has `createdByUserId = manager.id`,
   `driverId = dto.driverId`, `createdByRole = 'MANAGER'`. Assert
   the matching `audit_logs` row has the same `userId` and `role`.
3. **Drift**: run `IntegrityAuditService.run()` after backfill; assert
   `0` rows where `createdAt > soakStart AND createdByUserId IS NULL`.
4. **Backwards compat**: existing reports that group by `driverId` keep
   working unchanged — no consumer reads `createdByUserId` until
   explicitly opted in.

## 8. What this proposal does NOT do

- It does NOT add a `cash.ownerType = 'BRANCH' | 'DRIVER'` column.
  Cash position is already derived from the chain
  (`Order.handoverShiftId → ManagerCashCustody.branchId → BankDepositLog`);
  adding a parallel column would create two sources of truth.
- It does NOT rename `ManagerCashCustody` → `BranchCashCustody`. The
  table semantics are correct (`branchId` is the canonical owner);
  the rename is cosmetic and cross-cutting, and would be its own PR.
- It does NOT change any cash-flow direction. The driver still
  collects cash on payment, the branch still receives via
  `confirmHandover`, the bank still receives via `BankDepositLog`.

## 9. Reviewer checklist

- [ ] Schema diff: only adds two nullable columns + one index + one
      relation. No data type changes on existing columns.
- [ ] Migration plan is reversible up to Phase 5.
- [ ] Backfill SQL is idempotent and side-effect-free.
- [ ] No production data overwritten unless the AuditLog already
      carries the actor/role.
- [ ] Cash-flow tests still pass (`npm test` finance + cash-monitor
      suites).
- [ ] `BranchCashLedgerService.project()` numbers match before vs. after
      the migration on a sandbox snapshot.
