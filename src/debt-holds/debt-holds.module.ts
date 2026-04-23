import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { DebtHoldsController } from './debt-holds.controller';
import { DebtHoldsService } from './debt-holds.service';

@Module({
  imports: [PrismaModule, AuthModule, SystemSettingsModule],
  controllers: [DebtHoldsController],
  providers: [DebtHoldsService],
  exports: [DebtHoldsService],
})
export class DebtHoldsModule {}
