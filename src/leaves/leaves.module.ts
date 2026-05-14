/**
 * وحدة الإجازات — تجمع متحكم الإجازات وخدمتها وتُصدّر الخدمة للوحدات الأخرى.
 * Leaves module — bundles the leaves controller and service; exports LeavesService.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LeavesController } from './leaves.controller';
import { LeavesService } from './leaves.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [LeavesController],
  providers: [LeavesService],
  exports: [LeavesService],
})
export class LeavesModule {}
