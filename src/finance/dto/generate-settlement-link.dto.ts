import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

/**
 * V25 — consolidated settlement link generation for multiple unpaid invoices.
 */
/**
 * DTO توليد رابط التسوية لفواتير متعددة غير مدفوعة
 * DTO for generating a consolidated settlement payment link for multiple unpaid invoices.
 * @since V25
 */
export class GenerateSettlementLinkDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  customerId!: string;

  @ApiProperty({
    type: [String],
    description: 'Unpaid invoice/order ids belonging to the same customer.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  invoiceIds!: string[];
}
