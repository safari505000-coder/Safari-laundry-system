import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Optional UPayments v2 `track_id` from the browser return URL.
 * Sent in JSON body so it survives CDNs/proxies that strip query params.
 */
export class GatewayTrackHintDto {
  @ApiPropertyOptional({
    description:
      'UPayments v2 track id (e.g. …v2 suffix) for get-payment-status inquiry',
  })
  @IsOptional()
  @IsString()
  @MaxLength(384)
  trackId?: string;

  /** Same as `trackId` — some clients send snake_case JSON. */
  @ApiPropertyOptional({
    description: 'Alias of trackId (UPayments v2 id for inquiry)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(384)
  track_id?: string;
}
