import {
  Body,
  Controller,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from '../common/services/payments.service';
import { PaymentCallbackDto } from './dto/payment-callback.dto';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Public webhook — gateway posts payment result (no JWT).
   * Secured via PAYMENTS_SECRET signature on the payload.
   */
  @Post('callback')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Kuwait Gateway payment callback',
    description:
      'Expects JSON with orderId, status, optional amount, and signature. On success, completes the order and runs wallet settlement.',
  })
  async callback(@Body() body: PaymentCallbackDto) {
    if (!this.paymentsService.verifyIntegratedCallback(body)) {
      throw new UnauthorizedException('Invalid or missing payment callback signature');
    }

    const outcome = this.paymentsService.normalizeCallbackStatus(body.status);
    if (outcome === 'success') {
      await this.paymentsService.finalizePaidOrderFromGateway(body.orderId);
    }

    return { ok: true as const, orderId: body.orderId, outcome };
  }
}
