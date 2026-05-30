import { BadRequestException } from '@nestjs/common';
import { PosPaymentMethod, Prisma } from '@prisma/client';
import { toDbPosPaymentMethod } from '../finance/canonical-payment-method';
import type { OrderLineItemDto } from './dto/order-line-item.dto';
import { assertLineItemsMatchTotal } from './order-total.util';
import type { PosServiceKey } from './order-types';

/** Maps public/client payment input to DB enum values. */
export function resolvePosCheckoutPaymentMethod(
  _shortfallMinor: bigint,
  raw: PosPaymentMethod | string | undefined,
): PosPaymentMethod {
  return toDbPosPaymentMethod(raw) ?? PosPaymentMethod.CASH;
}

export function reconcileLineItems(
  totalPrice: number,
  lineItems?: OrderLineItemDto[],
):
  | {
      label: string | null;
      quantity: number;
      unitPrice: number;
      stockItemId: string | null;
    }[]
  | undefined {
  const items = lineItems ?? [];
  assertLineItemsMatchTotal(totalPrice, items);
  if (!items.length) {
    return undefined;
  }
  return items.map((line) => ({
    label: line.label?.trim() || null,
    starchOption: line.starchOption ?? 'NONE',
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    stockItemId: line.stockItemId ?? null,
  }));
}

/**
 * POS checkout line rows — use plain numbers for Decimal columns (avoids nested
 * Prisma.Decimal create quirks on some drivers).
 */
export function mapPosCheckoutLineItems(
  lineItems?: OrderLineItemDto[],
):
  | {
      label: string | null;
      quantity: number;
      unitPrice: number;
      stockItemId: string | null;
    }[]
  | undefined {
  const items = lineItems ?? [];
  if (!items.length) {
    return undefined;
  }
  return items.map((line) => ({
    label: line.label?.trim() || null,
    starchOption: line.starchOption ?? 'NONE',
    quantity: Number(line.quantity),
    unitPrice: Number(line.unitPrice),
    stockItemId: line.stockItemId ?? null,
  }));
}

export function resolveLaundryTierPrice(
  item: {
    priceNormal: Prisma.Decimal;
    priceUrgent: Prisma.Decimal;
    pricePressOnly: Prisma.Decimal | null;
    priceUrgentPress: Prisma.Decimal | null;
    branchOverrides: {
      priceNormal: Prisma.Decimal | null;
      priceUrgent: Prisma.Decimal | null;
      pricePressOnly: Prisma.Decimal | null;
      priceUrgentPress: Prisma.Decimal | null;
    }[];
  },
  serviceKey: PosServiceKey,
): Prisma.Decimal {
  const override = item.branchOverrides[0];
  const price =
    serviceKey === 'NORMAL'
      ? (override?.priceNormal ?? item.priceNormal)
      : serviceKey === 'URGENT'
        ? (override?.priceUrgent ?? item.priceUrgent)
        : serviceKey === 'PRESS_ONLY'
          ? (override?.pricePressOnly ?? item.pricePressOnly)
          : (override?.priceUrgentPress ?? item.priceUrgentPress);
  if (!price || price.lt(0)) {
    throw new BadRequestException('Selected service is not priced for this item.');
  }
  return price;
}
