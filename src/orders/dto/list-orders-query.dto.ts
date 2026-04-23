import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  CashStatus,
  OrderStatus,
  PosPaymentMethod,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * V19.22.5 — Invoices page filters for the Branch-Manager island
 * (and any other role that hits `GET /api/orders`). Every field is
 * optional; omit all to get the role-scoped defaults.
 *
 * Branch scoping is applied *server-side* on top of these filters:
 * `MANAGER` always sees their own branch only (via `driver.branchId`
 * = manager's `branchId` from the JWT). Exec pair (OWNER / GM) and
 * CC still see the whole fleet. DRIVER sees only their own rows.
 */
export class ListOrdersQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by assigned driver (UUID). MANAGER: must be a driver of their branch.',
  })
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({
    enum: PosPaymentMethod,
    description: 'Declared POS payment method.',
  })
  @IsOptional()
  @IsEnum(PosPaymentMethod)
  posPaymentMethod?: PosPaymentMethod;

  @ApiPropertyOptional({
    enum: CashStatus,
    description: 'Cash settlement state.',
  })
  @IsOptional()
  @IsEnum(CashStatus)
  cashStatus?: CashStatus;

  @ApiPropertyOptional({
    description: 'Inclusive lower bound on createdAt (ISO-8601 date or datetime).',
    example: '2026-04-01',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: 'Inclusive upper bound on createdAt (ISO-8601 date or datetime).',
    example: '2026-04-23',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;

  /**
   * Free-text search on customer phone / displayName / invoiceNumber /
   * serialNumber. Whitespace-trimmed; empty → ignored.
   */
  @ApiPropertyOptional({
    description:
      'Free-text search: customer phone, customer name, invoice number, or serial number.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(64)
  q?: string;
}
