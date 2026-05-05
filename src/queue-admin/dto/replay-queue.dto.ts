import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ReplayQueueDto {
  @IsIn(['alerts', 'whatsapp'])
  queue!: 'alerts' | 'whatsapp';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
