import { Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { FinancialSnapshotService } from '../../finance/snapshots/financial-snapshot.service';
import { SnapshotRealtimeRefresher } from '../../finance/snapshots/snapshot-realtime-refresher.service';
import { type FinancialDomainEvent } from '../financial-domain-event.types';
import type { SnapshotRefreshSource } from '../../finance/snapshots/financial-snapshot.types';

/**
 * V20.4 — Phase 5 / V20.6 — Phase 5 wiring.
 *
 * Single subscriber that fans every `finance.*` event out to
 * `FinancialSnapshotService` for projection refresh. The mapping
 * from event name → snapshot source is centralised here so
 * operators can grep `[FINANCIAL_SNAPSHOT_REFRESH] source=…` and
 * trace it back to the originating financial write.
 *
 * V20.6 — When the realtime refresher is registered (via
 * `FinancialSnapshotsModule`), this listener routes through it so
 * rapid-fire events for the same customer are debounced + cooldown-
 * capped instead of issuing N back-to-back snapshot writes. When
 * the refresher is absent (legacy boot path), it falls back to the
 * direct `refreshOneInBackground` call so older deployments work
 * unchanged.
 *
 * Wildcard subscriber pattern keeps new events automatic — adding
 * a new `finance.*` event in {@link FinancialDomainEventName}
 * starts updating snapshots without touching this file.
 */

const SOURCE_MAP: Record<string, SnapshotRefreshSource> = {
  'finance.invoice.issued': 'INVOICE_ISSUED',
  'finance.invoice.reversed': 'CRON_RECONCILE', // V20.6 — Phase 4
  'finance.payment.captured': 'PAYMENT_CAPTURED',
  'finance.payment.partial': 'PARTIAL_PAYMENT_RECORDED',
  'finance.wallet.absorbed': 'WALLET_ABSORBED',
  'finance.wallet.adjusted': 'CRON_RECONCILE', // V20.6 — Phase 4
  'finance.refund.created': 'CRON_RECONCILE', // V20.6 — Phase 4
  'finance.subscription.activated': 'SUBSCRIPTION_ACTIVATED',
  'finance.collection.escalated': 'COLLECTION_ESCALATED',
  'finance.promise.broken': 'CRON_RECONCILE', // V20.6 — Phase 4
  'finance.promise.kept': 'CRON_RECONCILE', // V20.6 — Phase 4
  'finance.fraud.alert.created': 'CRON_RECONCILE', // V20.6 — Phase 4
  'finance.risk.recalculated': 'CRON_RECONCILE', // V20.6 — Phase 4
};

@Injectable()
export class FinancialSnapshotListener {
  private readonly logger = new Logger(FinancialSnapshotListener.name);

  constructor(
    private readonly snapshots: FinancialSnapshotService,
    @Optional() private readonly refresher: SnapshotRealtimeRefresher | null = null,
  ) {}

  @OnEvent('finance.*', { async: true })
  handle(event: FinancialDomainEvent): void {
    if (!event?.payload?.customerId) return;
    // Skip the snapshot's own refreshed event to avoid an infinite loop.
    if (event.name === 'finance.snapshot.refreshed') return;
    const source = SOURCE_MAP[event.name] ?? 'CRON_RECONCILE';
    try {
      if (this.refresher) {
        // V20.6 — Phase 5 realtime path with debounce + cooldown.
        this.refresher.request(
          event.payload.customerId,
          source,
          event.payload.correlationId ?? null,
        );
      } else {
        // Legacy direct path — still safe because refreshOneInBackground
        // swallows failures.
        this.snapshots.refreshOneInBackground(
          event.payload.customerId,
          source,
          event.payload.correlationId ?? null,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[FINANCIAL_SNAPSHOT_LISTENER_FAILED] event=${event.name} customerId=${event.payload.customerId} message=${message}`,
      );
    }
  }
}

