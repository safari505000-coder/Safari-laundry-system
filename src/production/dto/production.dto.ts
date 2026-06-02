import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  GarmentIssueType,
  GarmentStage,
  ProductionDecisionType,
  ProductionWorkType,
} from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Worker reports a defect on the garment they currently hold. */
export class ReportIssueDto {
  @ApiProperty({ enum: GarmentIssueType })
  @IsEnum(GarmentIssueType)
  issueType: GarmentIssueType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Optional evidence photo URL.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoUrl?: string;
}

/** Worker / manager appends an internal production note (never customer-facing). */
export class AddNoteDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  note: string;
}

/** Manager / QC / Owner disposition on an open issue. */
export class ProductionDecisionDto {
  @ApiProperty({ enum: ProductionDecisionType })
  @IsEnum(ProductionDecisionType)
  decision: ProductionDecisionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  customerContactRequired?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  compensationRequired?: boolean;
}

/** Manager reassigns the worker designated for a garment's current stage. */
export class ReassignTaskDto {
  @ApiPropertyOptional({
    description: 'Worker user id to assign, or null to return to the open queue.',
  })
  @IsOptional()
  @IsUUID()
  workerId?: string | null;
}

class GarmentIntakeItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orderLineItemId?: string;
}

/** Manager intake: create the tracked garments for an order. */
export class GarmentIntakeDto {
  @ApiProperty()
  @IsUUID()
  orderId: string;

  @ApiPropertyOptional({
    description:
      'Quick mode: number of identical untagged garments to create (1..200).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  count?: number;

  @ApiPropertyOptional({ type: [GarmentIntakeItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GarmentIntakeItemDto)
  items?: GarmentIntakeItemDto[];
}

/** Optional query to scope the worker queue to a specialisation/stage. */
export class WorkerTaskQueryDto {
  @ApiPropertyOptional({ enum: ProductionWorkType })
  @IsOptional()
  @IsEnum(ProductionWorkType)
  workType?: ProductionWorkType;

  @ApiPropertyOptional({ enum: GarmentStage })
  @IsOptional()
  @IsEnum(GarmentStage)
  stage?: GarmentStage;
}
