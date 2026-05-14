import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * تعديل الطلب — تحديث الحالة أو الملاحظات فقط (كلا الحقلين اختياريان).
 * Update-order DTO — patch the order status and/or notes; both fields are optional.
 */
export class UpdateOrderDto {
  @ApiPropertyOptional({ enum: OrderStatus, enumName: 'OrderStatus' })
  @IsOptional()
  @IsEnum(OrderStatus, {
    message:
      'status must be a valid pipeline value (PENDING, PICKED_UP, IN_PROGRESS, OUT_FOR_DELIVERY, COMPLETED, CANCELED)',
  })
  status?: OrderStatus;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
