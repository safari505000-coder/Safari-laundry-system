import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/roles.decorator';
import { APP_BRAND } from '../common/constants/branding';
import { OperatingHoursService } from './operating-hours.service';

@ApiTags('system')
@Controller('system')
@Public('Operating-hours status is public so the web app can show closure state.')
export class SystemController {
  constructor(private readonly operatingHours: OperatingHoursService) {}

  @Get('operating-status')
  @ApiOperation({
    summary: `Operating hours (Kuwait) — ${APP_BRAND}`,
    description:
      'Public. Used by the web app to show Safari Express “system closed” outside 07:00–23:00 Kuwait time.',
  })
  operatingStatus() {
    return this.operatingHours.getStatusPayload();
  }
}
