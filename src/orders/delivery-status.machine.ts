import { BadRequestException } from '@nestjs/common';
import { DeliveryStatus } from '@prisma/client';

const terminal: DeliveryStatus[] = [
  DeliveryStatus.DELIVERED,
];

const forwardEdges: Record<DeliveryStatus, DeliveryStatus[]> = {
  [DeliveryStatus.READY]: [DeliveryStatus.OUT_FOR_DELIVERY],
  [DeliveryStatus.OUT_FOR_DELIVERY]: [
    DeliveryStatus.DELIVERED,
    DeliveryStatus.RETURNED_TO_BRANCH,
  ],
  [DeliveryStatus.RETURNED_TO_BRANCH]: [DeliveryStatus.OUT_FOR_DELIVERY],
  [DeliveryStatus.DELIVERED]: [],
};

export function assertDeliveryStatusTransition(
  current: DeliveryStatus,
  next: DeliveryStatus,
): void {
  if (current === next) {
    return;
  }
  if (terminal.includes(current)) {
    throw new BadRequestException(
      `Delivery status cannot change once it is ${current}`,
    );
  }
  const allowed = forwardEdges[current] ?? [];
  if (!allowed.includes(next)) {
    throw new BadRequestException(
      `Invalid delivery transition: ${current} → ${next}. Allowed: ${allowed.join(', ') || 'none'}`,
    );
  }
}
