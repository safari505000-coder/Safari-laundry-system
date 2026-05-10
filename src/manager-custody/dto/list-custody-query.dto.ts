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

export class StaffDebtsQueryDto {
  @ApiPropertyOptional({ description: 'Branch id or ALL' })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiPropertyOptional({ description: 'Name search' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'ALL | driver:<id> | manager:<id>' })
  @IsOptional()
  @IsString()
  employee?: string;

  @ApiPropertyOptional({ enum: ['ALL', 'OVERDUE', 'CURRENT'] })
  @IsOptional()
  @IsString()
  status?: 'ALL' | 'OVERDUE' | 'CURRENT';
}
