import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({ example: 'Salmiya' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'Block 4, Street 12' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  location!: string;

  @ApiPropertyOptional({ example: '+965 5000 0000' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /**
   * HQ / cost-center branch: no POS, no users, hidden from operational roles.
   */
  @ApiPropertyOptional({
    default: false,
    description:
      'Administrative branch only — cost center for central expenses & payroll attribution.',
  })
  @IsOptional()
  @IsBoolean()
  isAdministrative?: boolean;
}
