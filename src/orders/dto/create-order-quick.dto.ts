import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PosPaymentMethod, ServiceType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsPositive,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * V19.22.4 — Payment-method subset allowed on the *driver's quick
 * capture* form. `SUBSCRIPTION_WALLET` is intentionally excluded
 * because wallet settlement requires a balance lookup + ledger write
 * that only the full POS-checkout path is authorized to perform.
 *
 * The TypeScript property type stays as the full `PosPaymentMethod`
 * enum so `PosCheckoutDto` (which extends this class) can remain
 * compatible; narrowing is enforced at runtime through `@IsIn`.
 */
const QUICK_PAYMENT_METHODS: PosPaymentMethod[] = [
  PosPaymentMethod.CASH,
  PosPaymentMethod.KNET,
  PosPaymentMethod.PAYMENT_LINK,
  PosPaymentMethod.ONLINE,
  PosPaymentMethod.DEBT_ON_ACCOUNT,
];
import { IsKuwaitCustomerPhone } from '../../common/validation/kuwait-customer-phone';
import { OrderLineItemDto } from './order-line-item.dto';

/** Minimal payload for drivers creating an order in the field (mobile-first). */
export class CreateOrderQuickDto {
  @ApiProperty({ example: '51234567' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '').trim() : value,
  )
  @IsString()
  @MinLength(8)
  @IsKuwaitCustomerPhone()
  customerPhone: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'When set, order is attached to this customer (phone must match customerPhone)',
  })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({
    maxLength: 200,
    description: 'Saved on customer when creating or updating',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerDisplayName?: string;

  @ApiProperty({
    example: 120.5,
    description:
      'Declared order total — must be > 0; if lineItems sent, must equal their sum',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  totalPrice: number;

  @ApiPropertyOptional({
    example: 'INV-2026-88421',
    description: 'Optional until the paper invoice is available',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  invoiceNumber?: string;

  @ApiPropertyOptional({ example: 'Customer asked for call before delivery' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Skip on mobile if unknown; can be updated later',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerAddress?: string;

  @ApiPropertyOptional({
    enum: ServiceType,
    enumName: 'ServiceType',
    description: 'Must be EXPRESS or NORMAL when supplied; defaults to NORMAL',
  })
  @IsOptional()
  @IsEnum(ServiceType, {
    message: 'serviceType must be EXPRESS or NORMAL',
  })
  serviceType?: ServiceType;

  @ApiPropertyOptional({
    type: [OrderLineItemDto],
    description:
      'Optional line items; when present, Σ(qty×unitPrice) must match totalPrice (safety check)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, {
    message: 'When lineItems is provided, at least one line is required',
  })
  @ValidateNested({ each: true })
  @Type(() => OrderLineItemDto)
  lineItems?: OrderLineItemDto[];

  /**
   * V19.22.4 — REQUIRED on the Quick-Capture path. Every field
   * invoice must declare its intended settlement channel upfront,
   * closing the historical accountability gap where orders created
   * on the field without a payment method sat as
   * `posPaymentMethod=null` forever. The value is stamped on the
   * `Order` row at creation; the actual cashStatus transition still
   * happens via POS checkout (or a subsequent status update to
   * `COMPLETED`, which auto-flips cashStatus via
   * `cashStatusForPaymentMethod`).
   *
   * Allowed: CASH, KNET, PAYMENT_LINK, ONLINE, DEBT_ON_ACCOUNT.
   * Excluded: SUBSCRIPTION_WALLET — requires a wallet-balance check
   * that only the full POS-checkout path performs.
   *
   * Typed as optional at the TypeScript level so `PosCheckoutDto`
   * (which also extends this class but needs wallet auto-resolution)
   * remains compatible; required-ness is enforced at runtime via
   * `@IsNotEmpty`.
   */
  @ApiProperty({
    enum: QUICK_PAYMENT_METHODS,
    enumName: 'QuickPaymentMethod',
    description:
      'Required. Declared settlement channel — one of CASH, KNET, PAYMENT_LINK, ONLINE, DEBT_ON_ACCOUNT.',
  })
  @IsNotEmpty({ message: 'posPaymentMethod is required' })
  @IsIn(QUICK_PAYMENT_METHODS, {
    message:
      'posPaymentMethod must be CASH, KNET, PAYMENT_LINK, ONLINE, or DEBT_ON_ACCOUNT',
  })
  posPaymentMethod?: PosPaymentMethod;
}
