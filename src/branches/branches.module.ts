/**
 * وحدة الفروع — تجمع متحكم الفروع وخدمتها وتُصدّر الخدمة للوحدات الأخرى.
 * Branches module — bundles the branches controller and service; exports BranchesService.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [BranchesController],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}
