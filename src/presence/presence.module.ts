import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';

/**
 * V23 Phase 6 — Operator Presence module.
 *
 * Visibility-only presence registry. Wired into `AppModule` so the
 * SSE/HTTP shell layers can read live operator state without
 * touching financial code paths.
 */
@Module({
  imports: [UsersModule],
  controllers: [PresenceController],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
