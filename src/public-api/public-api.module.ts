import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SerialsModule } from '../serials/serials.module';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';
import { WebsiteOrderRequestsService } from './website-order-requests.service';

@Module({
  imports: [PrismaModule, SerialsModule, FinanceModule],
  controllers: [PublicApiController],
  providers: [PublicApiService, WebsiteOrderRequestsService],
})
export class PublicApiModule {}
