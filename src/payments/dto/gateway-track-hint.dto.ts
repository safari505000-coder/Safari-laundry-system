import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Optional payment-status inquiry id from the browser return URL / recheck body.
 * UPayments docs call the path segment `track_id`; the merchant dashboard often
 * labels the same value **trans_id** / **tran_id**. Sent in JSON so it survives
 * CDNs/proxies that strip query params.
 */
export class GatewayTrackHintDto {
  @ApiPropertyOptional({
    description:
      'Merchant dashboard trans_id (preferred for get-payment-status inquiry id)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(384)
  trans_id?: string;

  @ApiPropertyOptional({ description: 'camelCase alias of trans_id' })
  @IsOptional()
  @IsString()
  @MaxLength(384)
  transId?: string;

  @ApiPropertyOptional({
    description: 'UPayments tran_id — same inquiry-id slot as trans_id / track_id',
  })
  @IsOptional()
  @IsString()
  @MaxLength(384)
  tran_id?: string;

  @ApiPropertyOptional({ description: 'camelCase alias of tran_id' })
  @IsOptional()
  @IsString()
  @MaxLength(384)
  tranId?: string;

  @ApiPropertyOptional({
    description:
      'UPayments track_id (e.g. …v2 suffix) — same inquiry slot as trans_id',
  })
  @IsOptional()
  @IsString()
  @MaxLength(384)
  trackId?: string;

  /** Same as `trackId` — some clients send snake_case JSON. */
  @ApiPropertyOptional({
    description: 'Alias of trackId (inquiry id for get-payment-status)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(384)
  track_id?: string;

  /**
   * Gateway return URL `result=` (e.g. CAPTURED). When present with a v2
   * `track_id`, the server may finalize without waiting for UPayments inquiry.
   */
  @ApiPropertyOptional({
    description: 'Echo of return URL result= (CAPTURED, FAILED, …)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  result?: string;
}
