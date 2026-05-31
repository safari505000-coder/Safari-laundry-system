import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OrderLineItemDto } from './dto/order-line-item.dto';
import { PosCheckoutDto } from './dto/pos-checkout.dto';
import { POS_DELIVERY_FEE_KD } from './order-constants';
import {
  mapPosCheckoutLineItems,
  reconcileLineItems,
  resolveLaundryTierPrice,
} from './order-pos-pricing.util';
import { type PosPricedLineCreate } from './order-types';

/**
 * Phase 4 extraction — POS checkout pricing (server-side tier pricing,
 * delivery-row, and trusted-receipt reconciliation).
 *
 * `*Tx` pattern: every method operates ONLY on the `tx` passed by the caller.
 * This service NEVER opens its own `$transaction` and NEVER touches a Prisma
 * client directly — OrdersService stays the transaction owner.
 */
@Injectable()
export class OrderPosPricingService {

  async pricePosCheckoutLinesTx(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    lineItems?: OrderLineItemDto[],
  ): Promise<{
    lineCreates: PosPricedLineCreate[];
    totalPriceDecimal: Prisma.Decimal;
  }> {
    const input = lineItems ?? [];
    if (input.length === 0) {
      throw new BadRequestException('POS checkout requires line items.');
    }

    const actor = await tx.user.findUnique({
      where: { id: actorUserId },
      select: { branchId: true },
    });
    const branchId = actor?.branchId ?? null;
    const itemIds = [
      ...new Set(
        input
          .map((line) => line.laundryPriceListItemId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];
    if (itemIds.length !== input.length) {
      throw new BadRequestException(
        'POS checkout lines must reference catalog item ids.',
      );
    }

    const items = await tx.laundryPriceListItem.findMany({
      where: { id: { in: itemIds }, isActive: true },
      include: {
        branchOverrides: branchId ? { where: { branchId } } : true,
      },
    });
    const byId = new Map(items.map((item) => [item.id, item]));
    let total = new Prisma.Decimal(0);
    const lineCreates: PosPricedLineCreate[] = [];

    for (const line of input) {
      const serviceKey = line.posServiceKey;
      if (
        serviceKey !== 'NORMAL' &&
        serviceKey !== 'URGENT' &&
        serviceKey !== 'PRESS_ONLY' &&
        serviceKey !== 'URGENT_PRESS'
      ) {
        throw new BadRequestException('POS checkout lines must include service tier.');
      }
      if (!(line.quantity > 0)) {
        throw new BadRequestException('Each line item must have a positive quantity.');
      }
      const item = byId.get(line.laundryPriceListItemId!);
      if (!item) {
        throw new BadRequestException('Selected catalog item is inactive or missing.');
      }
      if (item.manualEntry) {
        throw new BadRequestException(
          'Manual-price catalog items are not allowed in mobile POS checkout.',
        );
      }
      const unitPrice = resolveLaundryTierPrice(item, serviceKey);
      if (unitPrice.lte(0)) {
        throw new BadRequestException('Selected service has no positive catalog price.');
      }
      const quantity = new Prisma.Decimal(Number(line.quantity).toFixed(4));
      const labelSuffix =
        serviceKey === 'NORMAL'
          ? 'غسيل عادي'
          : serviceKey === 'URGENT'
            ? 'خدمة سريعة'
            : serviceKey === 'PRESS_ONLY'
              ? 'كي فقط'
              : 'دراي كلين سريع';
      total = total.plus(quantity.mul(unitPrice));
      lineCreates.push({
        label: `${item.nameAr} — ${labelSuffix}`,
        starchOption: 'NONE',
        quantity: quantity.toFixed(4),
        unitPrice: unitPrice.toFixed(4),
        stockItemId: line.stockItemId ?? null,
      });
    }

    total = total.plus(POS_DELIVERY_FEE_KD);
    lineCreates.push({
      label: 'توصيل داخل المنطقة',
      starchOption: 'NONE',
      quantity: '1.0000',
      unitPrice: POS_DELIVERY_FEE_KD.toFixed(4),
      stockItemId: null,
    });

    return {
      lineCreates,
      totalPriceDecimal: new Prisma.Decimal(total.toFixed(4)),
    };
  }

  /**
   * Driver POS checkout pricing:
   * - Catalog-only payloads (mobile garment lines) → server-side tier pricing + delivery row.
   * - Mixed/receipt payloads (VIP, attached-invoice delivery @ 0) → trust client line totals.
   */
  async resolvePosCheckoutPricingTx(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    dto: PosCheckoutDto,
  ): Promise<{
    lineCreates: PosPricedLineCreate[];
    totalPriceDecimal: Prisma.Decimal;
  }> {
    const items = dto.lineItems ?? [];
    if (items.length === 0) {
      throw new BadRequestException('POS checkout requires line items.');
    }
    const catalogOnly = items.every(
      (line) =>
        typeof line.laundryPriceListItemId === 'string' &&
        line.laundryPriceListItemId.length > 0 &&
        line.posServiceKey,
    );
    if (catalogOnly) {
      return this.pricePosCheckoutLinesTx(tx, actorUserId, dto.lineItems);
    }
    reconcileLineItems(dto.totalPrice, items);
    const mapped = mapPosCheckoutLineItems(items);
    if (!mapped?.length) {
      throw new BadRequestException('POS checkout requires line items.');
    }
    for (const line of mapped) {
      if (!(line.quantity > 0 && line.unitPrice >= 0)) {
        throw new BadRequestException(
          'Each line item must have a positive quantity and a non-negative unit price',
        );
      }
    }
    return {
      lineCreates: mapped.map((line) => ({
        label: line.label,
        starchOption: 'NONE' as const,
        quantity: Number(line.quantity).toFixed(4),
        unitPrice: Number(line.unitPrice).toFixed(4),
        stockItemId: line.stockItemId,
      })),
      totalPriceDecimal: new Prisma.Decimal(Number(dto.totalPrice).toFixed(4)),
    };
  }
}
