# Operational Runbooks

> Step-by-step playbooks for the on-call engineer.
>
> Each runbook follows the same shape:
>
> 1. **Symptoms** — what alerts / metrics / user reports trigger this.
> 2. **Triage** — what to check first.
> 3. **Containment** — how to stop the bleeding.
> 4. **Recovery** — how to fully restore.
> 5. **Post-incident** — what to document.
>
> Runbooks are **living documents**. After every incident, edit the
> matching runbook with new findings.

## Index

| Runbook | When to use |
| --- | --- |
| [`payment-failure.md`](./payment-failure.md) | Payments not finalising; gateway errors; unbalanced AR. |
| [`reconciliation-drift.md`](./reconciliation-drift.md) | Reconciliation identity returns drift > 0; trial balance imbalance. |
| [`websocket-outage.md`](./websocket-outage.md) | Realtime gateway disconnected; UI not updating in real time. |
| [`rollback-procedure.md`](./rollback-procedure.md) | A deploy went bad; need to revert to previous version safely. |
| [`production-deployment.md`](./production-deployment.md) | The standard production deployment recipe. |
| [`incident-response.md`](./incident-response.md) | Generic incident-response checklist; how to declare, escalate, communicate. |
| [`backup-restore.md`](./backup-restore.md) | Restore from a Postgres / Redis backup; PITR drill. |
| [`period-lock-enforcement.md`](./period-lock-enforcement.md) | Enabling `PERIOD_LOCK_ENFORCE=true` in production. |

## Pre-existing runbooks

The following are short stubs in `docs/runbooks/` and are still
authoritative for their narrow scope:

- [`docs/runbooks/payment-failure.md`](../../runbooks/payment-failure.md) — quick triage card.
- [`docs/runbooks/queue-backlog.md`](../../runbooks/queue-backlog.md) — quick queue triage card.
- [`docs/runbooks/redis-down.md`](../../runbooks/redis-down.md) — quick Redis triage card.
- [`docs/operations/replay-safety.md`](../../operations/replay-safety.md) — replay-safety contract.

The runbooks in this folder are the **deeper playbooks** for
multi-step incidents. The cards in `docs/runbooks/` are the quick
references for first-responders.
