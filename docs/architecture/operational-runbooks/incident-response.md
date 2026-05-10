# Runbook — Incident response

> The generic incident-response checklist. All other runbooks
> reference this one for the boring-but-essential ceremony.

## 1. Severity matrix

| Sev | Definition | Examples | Page |
| --- | --- | --- | --- |
| **P0** | Money is at risk. Reconciliation is failing. Customers are being charged incorrectly. | Reconciliation drift > 0; bypass-write detected; widespread payment finalize failure | Architect + Ops + CEO |
| **P1** | Critical operational degradation. POS or payments degraded for > 5 min. | Gateway down; widespread 5xx; cash-monitor down for the office | Architect + Ops |
| **P2** | Degradation affecting one role / one workflow. | Single branch's POS struggling; collections workspace slow | Ops on-call |
| **P3** | Cosmetic or minor degradation. | UI spinner stuck; a single dashboard tile failing | Best-effort fix in business hours |

## 2. Declare an incident

The on-call engineer declares by:

1. Posting in `#alerts-financial` with `🚨 INCIDENT P<sev>: <one-line summary>`.
2. Creating a ticket in the incident tracker.
3. Starting an incident video call (pinned in the channel header).
4. **Assigning roles:**
   - **IC (Incident Commander):** owns coordination + decisions.
     Usually the on-call engineer.
   - **Tech Lead:** owns hands-on triage / containment.
   - **Comms Lead:** owns external comms (call-centre, customers).
     For P0/P1 this should be ops manager or above.
5. Starting the timeline (paste in channel as you go):

   ```
   T+0  Alert fired
   T+2  IC declared P1
   T+5  Containment: read-only mode enabled
   T+8  Root cause identified: …
   T+15 Containment confirmed: drift stopped
   T+30 Recovery in progress: snapshot rebuild …
   T+45 Recovery confirmed: all checks green
   T+50 Incident closed
   ```

## 3. The first 10 minutes

| Step | Time | Action |
| --- | --- | --- |
| 1 | T+0 | Acknowledge the alert. |
| 2 | T+1 | Assess severity. If P0/P1, declare incident in `#alerts-financial`. |
| 3 | T+2 | Open the relevant runbook. |
| 4 | T+3 | Capture the alert details, error logs, and metric graphs into the timeline. |
| 5 | T+5 | Decide containment action (freeze writes? rollback? scale up?). |
| 6 | T+5 | If P0, notify ops manager **before** taking destructive action. |
| 7 | T+10 | Execute containment. |

## 4. During the incident — communication discipline

- **Single voice.** All external comms go through the Comms Lead.
- **No speculation.** Say "we are investigating" until you have
  data; never say "the database is corrupted" until you have proof.
- **Update every 15 min** on the channel even if there is no news.
  "Still investigating, no update" is acceptable.
- **Customer-facing messages** require ops manager sign-off.

## 5. Containment vs recovery

**Containment** = stop the bleeding (freeze writes, scale, rollback).
Buy time without making things worse.

**Recovery** = fully restore (rebuild snapshots, lift the freeze,
re-enable writes, confirm steady-state).

Always do containment first. The system can stay in a "frozen but
safe" state for hours. Skipping containment to chase recovery is
how outages turn into data loss.

## 6. Decision authority

| Decision | Who can authorise |
| --- | --- |
| Restart a pod | On-call engineer |
| Scale up workers | On-call engineer |
| Freeze writes (`READ_ONLY_FINANCIAL=true`) | On-call engineer (notify IC) |
| Rollback the app | IC |
| Run a forward-fix migration | Architect |
| Reverse a journal entry | Architect (P0 only) |
| Restore from backup | Architect + Ops manager (P0 only) |
| Disable an append-only DB trigger | **Forbidden.** No-one. |
| Customer-facing communication | Ops manager |

## 7. After containment — root cause analysis

Once the system is stable, **before recovery**, capture:

- The exact alert that fired.
- The sequence of events that led to the trigger.
- The change(s) that introduced the bug (recent deploys, config
  changes, third-party outages).
- Affected entities (orders, customers, journal entries).

Pin all relevant log snippets, queries, screenshots in the
incident ticket.

## 8. Recovery checks (always run)

After recovery:

- [ ] Reconciliation passes (all four identities).
- [ ] `payments_finalize_failure_total` rate at baseline.
- [ ] `reconciliation_drift_total` flat for 30 min.
- [ ] Customer 360 spot-checks (3 known customers).
- [ ] Cash-monitor classifier ↔ executive ↔ risk drift = 0.
- [ ] Journal trial balance Σ DR == Σ CR.

## 9. Closing the incident

The IC closes by:

1. Posting `✅ INCIDENT CLOSED P<sev>: <summary>` in the channel.
2. Stopping the incident timeline.
3. Filing a **post-mortem ticket** within 24 hours.

## 10. Post-mortem template

```md
# Incident Post-mortem — <YYYY-MM-DD> <summary>

## Severity
P<sev>

## Timeline
T+0 …
T+5 …
T+30 …

## Root cause
<one paragraph; link the offending PR / commit / migration>

## Customer impact
- Orders affected: <count> (<value KD>)
- Customers affected: <count>
- Duration of degradation: <minutes>

## What worked
- …

## What didn't work
- …

## Action items (SMART, owners assigned, dates)
- [ ] <Action 1> — owner — by <date>
- [ ] <Action 2> — owner — by <date>

## Runbook updates
- Updated <runbook> to add <new case>.
- Created <new runbook> for <new failure mode>.
```

## 11. Blameless culture

Post-mortems are **about systems**, not people. Never write "X
caused this incident". Write "the system allowed this incident
because Y". Action items target the system (better tests, better
guards, better runbooks), not the person.

If a person is repeatedly involved in incidents, that is a
management conversation, not a post-mortem comment.

## 12. Related

- [`payment-failure.md`](./payment-failure.md)
- [`reconciliation-drift.md`](./reconciliation-drift.md)
- [`websocket-outage.md`](./websocket-outage.md)
- [`rollback-procedure.md`](./rollback-procedure.md)
- [`backup-restore.md`](./backup-restore.md)
