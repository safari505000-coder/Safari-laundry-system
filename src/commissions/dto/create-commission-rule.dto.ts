import {
  CommissionCalculationBase,
  CommissionMode,
  CommissionPayoutTiming,
  SafariRole,
} from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateCommissionRuleDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /**
   * null = rule applies to all qualifying users regardless of role.
   * When set, the rule only fires for earners matching this role.
   */
  @IsOptional()
  @IsEnum(SafariRole)
  role?: SafariRole | null;

  @IsEnum(CommissionMode)
  mode!: CommissionMode;

  @IsOptional()
  @IsEnum(CommissionCalculationBase)
  calculationBase?: CommissionCalculationBase;

  /**
   * Percentage as a plain number (e.g. 5 = 5%), 0 ≤ p ≤ 100.
   */
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minInvoiceAmount?: number;

  @IsOptional()
  @IsEnum(CommissionPayoutTiming)
  payoutTiming?: CommissionPayoutTiming;

  @IsOptional()
  @IsBoolean()
  linkedToDebt?: boolean;
}
