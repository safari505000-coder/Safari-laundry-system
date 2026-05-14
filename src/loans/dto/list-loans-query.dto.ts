/**
 * استعلام قائمة القروض — فلترة اختيارية بالحالة ومعرف الموظف.
 * List-loans query DTO — optional filters for loan status and employee user ID.
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { LoanStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class ListLoansQueryDto {
  @ApiPropertyOptional({ enum: LoanStatus })
  @IsOptional()
  @IsEnum(LoanStatus)
  status?: LoanStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;
}
