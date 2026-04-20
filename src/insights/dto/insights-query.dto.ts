import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Stage-C — shared query shape for Insights AI endpoints.
 *
 * `days` governs the historical window (and, for forecasts, the
 * output horizon). We cap it at 120 to keep the in-memory numeric
 * computations cheap and the generated forecast cards readable.
 */
export class InsightsQueryDto {
  @ApiPropertyOptional({
    description: 'Historical / forecast window in days.',
    minimum: 7,
    maximum: 120,
    default: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => (value === '' || value == null ? undefined : value))
  @IsInt()
  @Min(7)
  @Max(120)
  days?: number;
}
