import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ManagerCashCustodyStatus } from '@prisma/client';

/** Filters for manager-custody aging/list endpoints. */
export class ListCustodyQueryDto {
  @ApiPropertyOptional({ enum: ManagerCashCustodyStatus })
  @IsOptional()
  @IsEnum(ManagerCashCustodyStatus)
  status?: ManagerCashCustodyStatus;

  @ApiPropertyOptional({ description: 'Manager user id' })
  @IsOptional()
  @IsString()
  managerId?: string;

  @ApiPropertyOptional({ description: 'Branch id' })
  @IsOptional()
  @IsString()
  branchId?: string;
}
