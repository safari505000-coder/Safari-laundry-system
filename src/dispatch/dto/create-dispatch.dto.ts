import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * V19.x — `POST /api/call-center/dispatch` body.
 *
 * The DTO is intentionally tiny:
 *   - The dispatch is an INSTRUCTION, not a financial document.
 *   - There is no amount, no service type, no items here. Money is
 *     created later when the driver opens the matching Order/Invoice.
 *   - There is no `acceptByDriver` flag — drivers cannot accept or
 *     reject. The dispatch sits ASSIGNED until an Order with the same
 *     `dispatchId` is created (auto-completion).
 */
export class CreateDispatchDto {
  @ApiProperty({
    description: 'Customer to send the driver to. Must NOT be blocked.',
    example: '11111111-1111-1111-1111-111111111111',
  })
  @IsUUID('4')
  customerId!: string;

  @ApiProperty({
    description:
      'Driver assigned to fulfil the dispatch. The driver receives the instruction via SSE / dashboard pull, with no accept/reject affordance.',
    example: '22222222-2222-2222-2222-222222222222',
  })
  @IsUUID('4')
  driverId!: string;

  @ApiPropertyOptional({
    description:
      'Optional free-text note the agent leaves for the driver (e.g. "العميل ينتظر بالباب — اتصل قبل الوصول").',
    example: 'استلام غسيل + توصيل بعد ساعتين',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructionNote?: string;
}
