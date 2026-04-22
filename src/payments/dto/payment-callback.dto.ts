import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * V1.7.0 — UPayments webhook payload.
 *
 * UPayments posts to `notificationUrl` with a JSON body whose
 * canonical shape is:
 *   { trackId, paymentId, result, tranId, reference, auth,
 *     customerExtraData, order: { id, reference }, ... }
 *
 * None of these fields are strictly required — the controller
 * re-verifies the payment with a Server-to-Server inquiry using
 * `trackId`, so we intentionally keep the DTO permissive. Legacy
 * fields (`orderId`, `status`, `signature`) are preserved for
 * backward compatibility with the devMock flow and with any non-
 * UPayments gateway that is pointed at this endpoint in the
 * future.
 */
export class PaymentCallbackDto {
  @ApiPropertyOptional({ description: 'UPayments charge trackId' })
  @IsOptional()
  @IsString()
  trackId?: string;

  /** Some UPayments endpoints upper-case this key. */
  @ApiPropertyOptional({ description: 'Alias: TrackID (upper-case variant)' })
  @IsOptional()
  @IsString()
  TrackID?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentId?: string;

  @ApiPropertyOptional({ description: 'UPayments result code (CAPTURED, FAILED, …)' })
  @IsOptional()
  @IsString()
  result?: string;

  @ApiPropertyOptional({ description: 'Gateway transaction id' })
  @IsOptional()
  @IsString()
  tranId?: string;

  @ApiPropertyOptional({ description: 'Merchant reference echoed by gateway' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ description: 'Auth code returned on success' })
  @IsOptional()
  @IsString()
  auth?: string;

  @ApiPropertyOptional({
    description:
      'Opaque data we echoed at charge time. Contains `orderId=<uuid>`.',
  })
  @IsOptional()
  @IsString()
  customerExtraData?: string;

  // ---------- Legacy / non-UPayments gateway fields ----------

  @ApiPropertyOptional({ description: 'Internal order UUID (legacy contract)' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({ description: 'Gateway outcome string (legacy contract)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Amount echoed by gateway (KWD)' })
  @IsOptional()
  @IsString()
  amount?: string;

  @ApiPropertyOptional({
    description:
      'HMAC-SHA256 hex of `${orderId}|${status}|${amount}` with PAYMENTS_SECRET (legacy only)',
  })
  @IsOptional()
  @IsString()
  signature?: string;

  @ApiPropertyOptional({
    description: 'Optional gateway-side reference (legacy).',
  })
  @IsOptional()
  @IsString()
  gatewayReference?: string;

  /** Dev only: when PAYMENTS_MOCK (or no gateway base URL), skip inquiry + HMAC verification. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  devMock?: boolean;
}
