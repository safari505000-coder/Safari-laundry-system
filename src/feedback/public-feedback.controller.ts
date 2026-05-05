import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/roles.decorator';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { FeedbackService } from './feedback.service';

/**
 * V19.22 — Public (login-less) customer feedback endpoint. The invoice
 * QR points at `/r/:orderId` on the SPA, which calls these endpoints
 * directly. No guards by design, same pattern as
 * `PublicStatementController`.
 *
 * Privacy model: the GET response is trimmed to data already on the
 * paper receipt (invoice number, total, date, driver first name).
 */
@ApiTags('public-feedback')
@Controller('public/orders')
@Public('Customer QR feedback endpoint is login-less and returns receipt-visible data only.')
export class PublicFeedbackController {
  constructor(private readonly svc: FeedbackService) {}

  @Get(':orderId')
  @ApiOperation({
    summary: 'Public invoice summary for the QR rating page',
    description:
      'V19.22 — returns the subset of the order visible on the paper receipt plus any existing rating the customer has already left. 404 is returned uniformly when the order does not exist so URL-harvesters cannot enumerate.',
  })
  get(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.svc.publicGetOrder(orderId);
  }

  @Post(':orderId/feedback')
  @ApiOperation({
    summary: 'Submit (or update) a QR-page rating + note',
    description:
      'V19.22 — idempotent upsert: the first submission creates the row, subsequent submissions from the same order overwrite and reset the acknowledged flag so the Owner / GM dashboard re-surfaces the update.',
  })
  submit(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: SubmitFeedbackDto,
    @Ip() ip: string,
  ) {
    return this.svc.submitFeedback(orderId, dto, ip ?? null);
  }
}
