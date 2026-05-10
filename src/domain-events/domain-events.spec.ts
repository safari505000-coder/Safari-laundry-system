import { EventEmitter2 } from '@nestjs/event-emitter';
import { FinancialDomainEventPublisher } from './financial-domain-event.publisher';
import { FinancialSnapshotListener } from './handlers/financial-snapshot.listener';

describe('FinancialDomainEventPublisher', () => {
  it('forwards typed events to EventEmitter2 with the correct name', () => {
    const bus = new EventEmitter2({ wildcard: true, delimiter: '.' });
    const publisher = new FinancialDomainEventPublisher(bus);
    const heard: { name: string; customerId: string }[] = [];
    bus.on('finance.payment.captured', (e: { name: string; payload: { customerId: string } }) => {
      heard.push({ name: e.name, customerId: e.payload.customerId });
    });
    publisher.publish('finance.payment.captured', {
      customerId: 'c1',
      orderId: 'o1',
      correlationId: 'cor-1',
      occurredAt: new Date().toISOString(),
      amountKd: '5.0000',
      paymentMethod: 'CASH',
    });
    expect(heard).toEqual([
      { name: 'finance.payment.captured', customerId: 'c1' },
    ]);
  });

  it('absorbs publisher exceptions so financial writes never see a bus failure', () => {
    const broken = {
      emit: () => {
        throw new Error('bus down');
      },
    } as unknown as EventEmitter2;
    const publisher = new FinancialDomainEventPublisher(broken);
    expect(() =>
      publisher.publish('finance.invoice.issued', {
        customerId: 'c1',
        orderId: 'o1',
        correlationId: null,
        occurredAt: new Date().toISOString(),
        invoiceTotalKd: '10.0000',
        posPaymentMethod: null,
      }),
    ).not.toThrow();
  });
});

describe('FinancialSnapshotListener', () => {
  it('refreshes the snapshot in the background using the event-derived source', () => {
    const refreshOneInBackground = jest.fn();
    const listener = new FinancialSnapshotListener({
      refreshOneInBackground,
    } as never);
    listener.handle({
      name: 'finance.payment.captured',
      payload: {
        customerId: 'c1',
        orderId: 'o1',
        correlationId: 'cor-1',
        occurredAt: new Date().toISOString(),
        amountKd: '5.0000',
        paymentMethod: 'CASH',
      },
    });
    expect(refreshOneInBackground).toHaveBeenCalledWith(
      'c1',
      'PAYMENT_CAPTURED',
      'cor-1',
    );
  });

  it('falls back to CRON_RECONCILE for unknown events but still fires', () => {
    const refreshOneInBackground = jest.fn();
    const listener = new FinancialSnapshotListener({
      refreshOneInBackground,
    } as never);
    listener.handle({
      name: 'finance.subscription.expired',
      payload: {
        customerId: 'c1',
        correlationId: null,
        occurredAt: new Date().toISOString(),
        expiredAt: new Date().toISOString(),
      },
    });
    expect(refreshOneInBackground).toHaveBeenCalledWith(
      'c1',
      'CRON_RECONCILE',
      null,
    );
  });
});
