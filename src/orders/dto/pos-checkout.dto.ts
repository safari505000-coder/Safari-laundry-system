import { ApiPropertyOptional } from '@nestjs/swagger';
import { PosPaymentMethod } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { CreateOrderQuickDto } from './create-order-quick.dto';

/** Driver POS: completes order in one step and records payment / wallet settlement. */
export class PosCheckoutDto extends CreateOrderQuickDto {
  @ApiPropertyOptional({
    enum: PosPaymentMethod,
    enumName: 'PosPaymentMethod',
    description:
      'When prepaid balance covers the full total, defaults to SUBSCRIPTION_WALLET. Otherwise required: CASH, KNET, ONLINE, or DEBT_ON_ACCOUNT.',
  })
  @Transform(({ value }: { value: unknown }) => {
    if (value === '' || value === null || value === undefined) {
      return undefined;
    }
    if (typeof value === 'string') {
      const t = value.trim();
      return t === '' ? undefined : t;
    }
    return value;
  })
  // V19.22.4 — Parent (`CreateOrderQuickDto`) now declares
  // `posPaymentMethod` as a required field at the runtime level.
  // POS checkout overrides that semantics because wallet-settled
  // orders auto-resolve the method to SUBSCRIPTION_WALLET inside
  // `OrdersService.resolvePosCheckoutPaymentMethod`. `declare`
  // keeps TypeScript compatible with the parent's property shape
  // while replacing its class-validator decorators below.
  @IsOptional()
  @IsEnum(PosPaymentMethod)
  declare posPaymentMethod?: PosPaymentMethod;

  /**
   * V19.x — Optional pointer to the call-center Dispatch this checkout
   * is fulfilling. When set, the EventEmitter `order.created` listener
   * marks the dispatch COMPLETED at the moment the order row is
   * committed (single source of truth for closure: the invoice).
   *
   * Drivers cannot accept/reject — the dispatch sits ASSIGNED until
   * exactly this field appears on a posted order.
   */
  @ApiPropertyOptional({
    description:
      'Optional Dispatch UUID this POS checkout fulfils. Auto-completes the dispatch on commit.',
    example: '33333333-3333-3333-3333-333333333333',
  })
  @IsOptional()
  @IsUUID('4')
  dispatchId?: string;
}
