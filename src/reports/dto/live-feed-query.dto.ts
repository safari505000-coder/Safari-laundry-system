import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * استعلام التغذية الحية — عدد الطلبات الأخيرة (1-25، الافتراضي 10).
 * Live-feed query DTO — optional limit for recent orders (1–25, default 10).
 */
export class LiveFeedQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  limit?: number;
}
