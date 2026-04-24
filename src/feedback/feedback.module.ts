import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { PublicFeedbackController } from './public-feedback.controller';

/**
 * V19.22 — Customer QR feedback (ratings + notes).
 *
 * Hosts two controllers that share the same service:
 *   • `PublicFeedbackController`  — login-less, backs the `/r/:id` page.
 *   • `FeedbackController`        — OWNER / GM / CC inbox.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PublicFeedbackController, FeedbackController],
  providers: [FeedbackService],
})
export class FeedbackModule {}
