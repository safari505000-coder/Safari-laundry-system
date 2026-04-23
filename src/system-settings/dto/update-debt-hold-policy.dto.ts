import { DebtHoldMode } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateDebtHoldPolicyDto {
  @IsBoolean()
  isActive!: boolean;

  @IsEnum(DebtHoldMode)
  holdMode!: DebtHoldMode;

  // Required when holdMode = FIXED; ignored otherwise.
  @ValidateIf((o: UpdateDebtHoldPolicyDto) => o.holdMode === DebtHoldMode.FIXED)
  @IsNumber()
  @Min(0)
  @IsOptional()
  fixedAmount?: number;
}
