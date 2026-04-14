import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

const terminal: OrderStatus[] = [OrderStatus.COMPLETED, OrderStatus.CANCELED];

/**
 * Allowed next statuses from each non-terminal state (strict pipeline + cancel).
 */
const forwardEdges: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.PICKED_UP, OrderStatus.CANCELED],
  [OrderStatus.PICKED_UP]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELED],
  [OrderStatus.IN_PROGRESS]: [
    OrderStatus.OUT_FOR_DELIVERY,
    OrderStatus.CANCELED,
  ],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.COMPLETED, OrderStatus.CANCELED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELED]: [],
};

export function assertOrderStatusTransition(
  current: OrderStatus,
  next: OrderStatus,
  hasDriver: boolean,
): void {
  if (current === next) {
    return;
  }
  if (terminal.includes(current)) {
    throw new BadRequestException(
      `Order status cannot change once it is ${current}`,
    );
  }
  if (next === OrderStatus.PICKED_UP && !hasDriver) {
    throw new BadRequestException(
      'Status PICKED_UP requires an assigned driver before this transition',
    );
  }
  if (
    next === OrderStatus.COMPLETED &&
    current !== OrderStatus.OUT_FOR_DELIVERY
  ) {
    throw new BadRequestException(
      'Status COMPLETED is only allowed after OUT_FOR_DELIVERY',
    );
  }
  const allowed = forwardEdges[current] ?? [];
  if (!allowed.includes(next)) {
    throw new BadRequestException(
      `Invalid status transition: ${current} → ${next}. Allowed from ${current}: ${allowed.join(', ') || 'none'}`,
    );
  }
}
