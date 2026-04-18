import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateInventoryCategoryDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nameAr!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
