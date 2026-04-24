import { Module } from '@nestjs/common';
import { OperatingHoursService } from './operating-hours.service';

/**
 * Single provider for `OPERATING_HOURS_*` so Auth and System can share
 * the same `isLockEnabled()` without circular imports.
 */
@Module({
  providers: [OperatingHoursService],
  exports: [OperatingHoursService],
})
export class OperatingHoursModule {}
