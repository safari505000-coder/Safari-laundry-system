import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuditLogTimelineRowDto {
  @ApiProperty()
  action!: string;

  @ApiPropertyOptional({ nullable: true })
  amount!: string | null;

  @ApiPropertyOptional({ nullable: true })
  source!: string | null;

  @ApiPropertyOptional({ nullable: true })
  userId!: string | null;

  @ApiProperty()
  timestamp!: string;
}

export class AuditLogTimelineResponseDto {
  @ApiProperty({ type: [AuditLogTimelineRowDto] })
  rows!: AuditLogTimelineRowDto[];
}
