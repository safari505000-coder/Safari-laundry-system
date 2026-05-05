import {
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FeedbackService } from './feedback.service';

/**
 * V19.22 — Authenticated read/write for the Customer Ratings inbox.
 *
 * Visible to:
 *   • OWNER / GENERAL_MANAGER  — strategic read only.
 *   • CALL_CENTER_SUPERVISOR  — operational inbox + acknowledge.
 *   • CALL_CENTER             — agent-level read + acknowledge (so the
 *                               agent closing the loop with the
 *                               customer can flag it as addressed).
 *
 * Other roles (ACCOUNTANT / MANAGER / DRIVER) deliberately excluded —
 * the feedback loop is a customer-service concern, not a finance or
 * HR one.
 */
@ApiTags('feedback')
@ApiBearerAuth('bearer')
@Controller('feedback')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeedbackController {
  constructor(private readonly svc: FeedbackService) {}

  @Get()
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
  )
  @ApiOperation({ summary: 'List customer feedback (paged) with summary stats' })
  list(
    @Query('onlyUnread') onlyUnreadRaw?: string,
    @Query('minRating') minRatingRaw?: string,
    @Query('maxRating') maxRatingRaw?: string,
    @Query('take') takeRaw?: string,
    @Query('skip') skipRaw?: string,
  ) {
    const onlyUnread = onlyUnreadRaw === 'true' || onlyUnreadRaw === '1';
    const minRating = minRatingRaw ? Number.parseInt(minRatingRaw, 10) : undefined;
    const maxRating = maxRatingRaw ? Number.parseInt(maxRatingRaw, 10) : undefined;
    const take = takeRaw ? Number.parseInt(takeRaw, 10) : undefined;
    const skip = skipRaw ? Number.parseInt(skipRaw, 10) : undefined;
    return this.svc.listFeedback({ onlyUnread, minRating, maxRating, take, skip });
  }

  @Patch(':id/acknowledge')
  @Roles(
    SafariRole.OWNER,
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
  )
  @ApiOperation({ summary: 'Mark a feedback row as seen / addressed' })
  acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.svc.acknowledge(id, user.userId);
  }
}

// Prevent TS "unused import" errors when strict build trims the pipes.
void ParseBoolPipe;
void ParseIntPipe;
