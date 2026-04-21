import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PosPaymentMethod, StarchOption } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * V19.9.1 — one row in the edit payload's line-items array. The
 * presence of `id` determines CRUD intent:
 *   • `id` supplied → update that existing OrderLineItem in place.
 *   • `id` absent   → insert a new line item.
 *   • An existing line whose `id` is NOT in the payload → deleted.
 *
 * `totalPrice` on the parent DTO is IGNORED when `lineItems` is
 * provided — the service recomputes Σ(quantity × unitPrice) so the
 * books always tie to the visible line breakdown.
 */
export class EditInvoiceLineItemDto {
  @ApiPropertyOptional({
    description: 'Existing line-item id to update; omit to insert a new one.',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({
    description: 'Human-readable label (service / garment description).',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @ApiPropertyOptional({
    enum: StarchOption,
    description: 'Optional starch preference for garment lines.',
  })
  @IsOptional()
  @IsEnum(StarchOption)
  starchOption?: StarchOption;

  @ApiProperty({
    description: 'Quantity, string to preserve 4-dp Decimal precision.',
    example: '1.000',
  })
  @IsNumberString({ no_symbols: false })
  quantity!: string;

  @ApiProperty({
    description: 'Unit price in KWD (3-dp).',
    example: '2.500',
  })
  @IsNumberString({ no_symbols: false })
  unitPrice!: string;
}

/**
 * V19.9 — CALL_CENTER_SUPERVISOR same-day invoice edit. Every non-
 * undefined field is applied; fields left undefined are kept as-is.
 * `reason` is optional for edits (unlike void) because an agent may
 * just want to fix a typo in the notes — but the audit log still
 * records the actor and the changed fields.
 *
 * V19.9.1 — `lineItems` added: when provided, replaces the full set
 * of line items on the order (add / update / delete) and the service
 * recomputes `totalPrice` from the new lines. When omitted, the
 * existing behaviour is preserved (header-only edit).
 */
export class EditInvoiceDto {
  @ApiPropertyOptional({
    description:
      'New total price in KWD, string to preserve 3-dp precision. Ignored when `lineItems` is supplied — total is then recomputed from Σ(qty × unitPrice).',
    example: '12.500',
  })
  @IsOptional()
  @IsNumberString({ no_symbols: false })
  totalPrice?: string;

  @ApiPropertyOptional({
    enum: PosPaymentMethod,
    description: 'Switch the payment method',
  })
  @IsOptional()
  @IsEnum(PosPaymentMethod)
  posPaymentMethod?: PosPaymentMethod;

  @ApiPropertyOptional({
    description: 'Free-text notes / remarks',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Optional free-text reason for the edit (audit metadata)',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    type: [EditInvoiceLineItemDto],
    description:
      'Full replacement set of line items. When provided, the service diffs against existing lines: rows with matching `id` are updated, rows without `id` are inserted, and existing rows missing from the payload are deleted. `totalPrice` is then auto-recomputed.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => EditInvoiceLineItemDto)
  lineItems?: EditInvoiceLineItemDto[];
}
