import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { APP_BRAND } from './common/constants/branding';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: `Service info (${APP_BRAND})` })
  getHello() {
    return this.appService.getHello();
  }
}
