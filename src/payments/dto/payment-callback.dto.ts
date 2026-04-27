import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * V1.7.0 — UPayments webhook payload.
 *
 * UPayments posts to `notificationUrl` with a JSON body whose
 * canonical shape is:
 *   { trackId, paymentId, result, tranId, reference, auth,
 *     customerExtraData, order: { id, reference }, ... }
 *
 * Official docs (developers.upayments.com) also use **snake_case**
 * keys on the webhook: `track_id`, `payment_id`, `tran_id`,
 * `requested_order_id`, `trn_udf`, etc. Those MUST be whitelisted here
 * or the global `ValidationPipe({ forbidNonWhitelisted: true })` rejects
 * the entire callback and the order never finalizes.
 *
 * None of these fields are strictly required — the controller may
 * finalize from a trusted CAPTURED + v2 `track_id` + Safari order id,
 * or fall back to Server-to-Server inquiry using the resolved track id.
 * Legacy fields (`orderId`, `status`, `signature`) are preserved for
 * backward compatibility with the devMock flow and with any non-
 * UPayments gateway that is pointed at this endpoint in the
 * future.
 */
export class PaymentCallbackDto {
  @ApiPropertyOptional({ description: 'UPayments charge trackId (camelCase)' })
  @IsOptional()
  @IsString()
  trackId?: string;

  /** Official UPayments webhook spelling (see add-charge / webhook docs). */
  @ApiPropertyOptional({ description: 'UPayments track_id (snake_case)' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  track_id?: string;

  /** Some UPayments endpoints upper-case this key. */
  @ApiPropertyOptional({ description: 'Alias: TrackID (upper-case variant)' })
  @IsOptional()
  @IsString()
  TrackID?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentId?: string;

  @ApiPropertyOptional({ description: 'UPayments payment_id (snake_case)' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  payment_id?: string;

  @ApiPropertyOptional({ description: 'UPayments result code (CAPTURED, FAILED, …)' })
  @IsOptional()
  @IsString()
  result?: string;

  @ApiPropertyOptional({ description: 'Gateway transaction id' })
  @IsOptional()
  @IsString()
  tranId?: string;

  @ApiPropertyOptional({ description: 'UPayments tran_id (snake_case)' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  tran_id?: string;

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

  /** Echoed on return URL — Safari `Order.id` when set at charge time. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  requested_order_id?: string;

  /** Gateway order id (may differ from Safari UUID — validate before use). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  order_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  refund_order_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  post_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  ref?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  payment_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  invoice_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  transaction_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  receipt_id?: string;

  @ApiPropertyOptional({
    description: 'Echo UDF; may contain orderId=<Safari uuid>',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  trn_udf?: string;

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
