import { BadRequestException } from '@nestjs/common';
import { DeliveryStatus } from '@prisma/client';
import { assertDeliveryStatusTransition } from './delivery-status.machine';

describe('delivery-status.machine', () => {
  it('allows READY → OUT_FOR_DELIVERY', () => {
    expect(() =>
      assertDeliveryStatusTransition(
        DeliveryStatus.READY,
        DeliveryStatus.OUT_FOR_DELIVERY,
      ),
    ).not.toThrow();
  });

  it('allows RETURNED_TO_BRANCH → OUT_FOR_DELIVERY retry', () => {
    expect(() =>
      assertDeliveryStatusTransition(
        DeliveryStatus.RETURNED_TO_BRANCH,
        DeliveryStatus.OUT_FOR_DELIVERY,
      ),
    ).not.toThrow();
  });

  it('rejects DELIVERED → OUT_FOR_DELIVERY', () => {
    expect(() =>
      assertDeliveryStatusTransition(
        DeliveryStatus.DELIVERED,
        DeliveryStatus.OUT_FOR_DELIVERY,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects READY → DELIVERED without out-for-delivery', () => {
    expect(() =>
      assertDeliveryStatusTransition(
        DeliveryStatus.READY,
        DeliveryStatus.DELIVERED,
      ),
    ).toThrow(BadRequestException);
  });
});
