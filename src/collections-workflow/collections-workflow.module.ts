import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { CollectionsWorkflowController } from './collections-workflow.controller';
import { CollectionsWorkflowService } from './collections-workflow.service';

/**
 * V23.1 Phase 7 — Collections Operational Workflow module.
 *
 * In-memory, visibility-only registry of callbacks / promises /
 * escalations consumed by the cockpit UI. Wired into `AppModule`
 * so the SSE/HTTP layers can read the live operator workspace
 * without touching financial code paths.
 */
@Module({
  imports: [UsersModule],
  controllers: [CollectionsWorkflowController],
  providers: [CollectionsWorkflowService],
  exports: [CollectionsWorkflowService],
})
export class CollectionsWorkflowModule {}
