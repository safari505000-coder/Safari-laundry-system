import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OperatingHoursService } from './operating-hours.service';
import { SystemController } from './system.controller';
import { OperatingHoursMiddleware } from '../common/middleware/operating-hours.middleware';

@Module({
  // AuthModule re-exports JwtModule so the middleware can verify the bearer
  // token; PrismaModule is needed for the OUT_OF_HOURS_ACCESS audit write.
  imports: [AuthModule, PrismaModule],
  controllers: [SystemController],
  providers: [OperatingHoursService, OperatingHoursMiddleware],
  exports: [OperatingHoursService, OperatingHoursMiddleware],
})
export class SystemModule {}
