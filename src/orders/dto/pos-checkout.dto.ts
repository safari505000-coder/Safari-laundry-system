import { ApiPropertyOptional } from '@nestjs/swagger';
import { PosPaymentMethod } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateOrderQuickDto } from './create-order-quick.dto';

/** Driver POS: completes order in one step and records payment / wallet settlement. */
export class PosCheckoutDto extends CreateOrderQuickDto {
  @ApiPropertyOptional({
    enum: PosPaymentMethod,
    enumName: 'PosPaymentMethod',
    description:
      'When prepaid balance covers the full total, defaults to SUBSCRIPTION_WALLET. Otherwise required: CASH, KNET, or PAYMENT_LINK.',
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
  @IsOptional()
  @IsEnum(PosPaymentMethod)
  posPaymentMethod?: PosPaymentMethod;
}
