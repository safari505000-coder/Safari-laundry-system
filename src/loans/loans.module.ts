/**
 * وحدة القروض — تجمع متحكم القروض وخدمتها وتُصدّر الخدمة للوحدات الأخرى.
 * Loans module — bundles the loans controller and service; exports LoansService.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [LoansController],
  providers: [LoansService],
  exports: [LoansService],
})
export class LoansModule {}
