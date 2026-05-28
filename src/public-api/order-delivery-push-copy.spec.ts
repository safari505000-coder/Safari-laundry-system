import { DeliveryStatus } from '@prisma/client';
import { orderDeliveryStatusPushCopy } from './order-delivery-push-copy';

describe('orderDeliveryStatusPushCopy', () => {
  it('returns Arabic copy for customer-visible delivery transitions', () => {
    const out = orderDeliveryStatusPushCopy(
      DeliveryStatus.OUT_FOR_DELIVERY,
      'D2-1045',
    );
    expect(out).toEqual({
      title: 'طلبك في الطريق',
      body: 'السائق في طريقه إليك — فاتورة D2-1045',
    });
  });

  it('returns null for READY (no push on checkout default)', () => {
    expect(
      orderDeliveryStatusPushCopy(DeliveryStatus.READY, 'INV-1'),
    ).toBeNull();
  });

  it('includes support phone on return-to-branch', () => {
    const out = orderDeliveryStatusPushCopy(
      DeliveryStatus.RETURNED_TO_BRANCH,
      'INV-9',
    );
    expect(out?.body).toContain('22200299');
    expect(out?.body).toContain('INV-9');
  });
});
