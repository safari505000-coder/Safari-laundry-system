import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemController } from './system.controller';
import { OperatingHoursMiddleware } from '../common/middleware/operating-hours.middleware';
import { OperatingHoursModule } from './operating-hours.module';

@Module({
  // AuthModule re-exports JwtModule so the middleware can verify the bearer
  // token; PrismaModule is needed for the OUT_OF_HOURS_ACCESS audit write.
  imports: [AuthModule, PrismaModule, OperatingHoursModule],
  controllers: [SystemController],
  providers: [OperatingHoursMiddleware],
  exports: [OperatingHoursModule, OperatingHoursMiddleware],
})
export class SystemModule {}
