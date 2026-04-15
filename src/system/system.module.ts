import { Module } from '@nestjs/common';
import { OperatingHoursService } from './operating-hours.service';
import { SystemController } from './system.controller';
import { OperatingHoursMiddleware } from '../common/middleware/operating-hours.middleware';

@Module({
  controllers: [SystemController],
  providers: [OperatingHoursService, OperatingHoursMiddleware],
  exports: [OperatingHoursService, OperatingHoursMiddleware],
})
export class SystemModule {}
