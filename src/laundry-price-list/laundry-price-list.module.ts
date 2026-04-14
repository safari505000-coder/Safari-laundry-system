import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LaundryPriceListController } from './laundry-price-list.controller';
import { LaundryPriceListService } from './laundry-price-list.service';

@Module({
  imports: [AuthModule],
  controllers: [LaundryPriceListController],
  providers: [LaundryPriceListService],
  exports: [LaundryPriceListService],
})
export class LaundryPriceListModule {}
