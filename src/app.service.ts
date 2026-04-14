import { Injectable } from '@nestjs/common';
import { APP_BRAND_ERP } from './common/constants/branding';

@Injectable()
export class AppService {
  getHello(): { message: string; product: string } {
    return {
      message: `Welcome to ${APP_BRAND_ERP}.`,
      product: APP_BRAND_ERP,
    };
  }
}
