import { BadRequestException } from '@nestjs/common';
import type { OrderLineItemDto } from './dto/order-line-item.dto';

const MONEY_EPS = 0.005;

/**
 * Verifies Σ(quantity × unitPrice) matches declared totalPrice before persisting.
 */
export function assertLineItemsMatchTotal(
  totalPrice: number,
  lineItems: OrderLineItemDto[],
): void {
  if (!lineItems.length) {
    return;
  }
  const computed = lineItems.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0,
  );
  if (!Number.isFinite(computed) || !Number.isFinite(totalPrice)) {
    throw new BadRequestException(
      'Invalid numeric values in line items or total',
    );
  }
  if (Math.abs(computed - totalPrice) > MONEY_EPS) {
    throw new BadRequestException(
      `Line items total (${computed.toFixed(4)}) does not match totalPrice (${totalPrice}). Recheck quantities and unit prices.`,
    );
  }
}
