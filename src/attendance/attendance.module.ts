/**
 * وحدة الحضور — تجمع متحكم الحضور وخدمته وتُصدّر الخدمة للوحدات الأخرى.
 * Attendance module — bundles the attendance controller and service; exports AttendanceService.
 */
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
