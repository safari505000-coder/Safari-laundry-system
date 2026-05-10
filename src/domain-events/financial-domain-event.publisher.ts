import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  type FinancialDomainEventName,
  type FinancialDomainEventPayloadByName,
} from './financial-domain-event.types';

/**
 * V20.4 — Phase 5 typed publisher.
 *
 * Producers inject this and call `publish('finance.payment.captured', payload)`
 * — the literal name is type-checked against
 * {@link FinancialDomainEventName}. The actual fan-out goes
 * through `EventEmitter2` (already wildcard-enabled in
 * `AppModule.EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' })`).
 *
 * Why a thin wrapper instead of `eventEmitter.emit` directly:
 *   • One audit log line per event (`[FINANCIAL_DOMAIN_EVENT]`)
 *     so operators can correlate snapshot refreshes with the
 *     originating financial write.
 *   • Subscribers can rely on the payload shape — adding a
 *     required field without bumping consumers becomes a
 *     compile-time error rather than a silent KeyError.
 *   • Future migration to a durable bus (Outbox table, Kafka,
 *     etc.) only touches this file.
 *
 * NEVER throws. A bus failure must not destabilise the financial
 * write that just committed.
 */
@Injectable()
export class FinancialDomainEventPublisher {
  private readonly logger = new Logger(FinancialDomainEventPublisher.name);

  constructor(private readonly bus: EventEmitter2) {}

  publish<N extends FinancialDomainEventName>(
    name: N,
    payload: FinancialDomainEventPayloadByName[N],
  ): void {
    try {
      this.bus.emit(name, { name, payload });
      this.logger.log(
        `[FINANCIAL_DOMAIN_EVENT] name=${name} customerId=${payload.customerId} correlationId=${payload.correlationId ?? '-'}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[FINANCIAL_DOMAIN_EVENT_FAILED] name=${name} customerId=${payload.customerId} message=${message}`,
      );
    }
  }
}
