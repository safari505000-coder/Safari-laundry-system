import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export enum AccountingScopeType {
  ALL = 'ALL',
  BRANCH = 'BRANCH',
  DRIVER = 'DRIVER',
}

export class AccountingReconciliationQueryDto {
  @ApiProperty({ example: '2026-05-02' })
  @IsISO8601({ strict: false })
  date!: string;

  @ApiPropertyOptional({ enum: AccountingScopeType, default: AccountingScopeType.ALL })
  @IsOptional()
  @IsEnum(AccountingScopeType)
  scopeType?: AccountingScopeType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  driverId?: string;
}

export class AccountingTimelineQueryDto {
  @ApiPropertyOptional({ enum: AccountingScopeType, default: AccountingScopeType.ALL })
  @IsOptional()
  @IsEnum(AccountingScopeType)
  scopeType?: AccountingScopeType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ example: '2026-05-02' })
  @IsISO8601({ strict: false })
  date!: string;
}
