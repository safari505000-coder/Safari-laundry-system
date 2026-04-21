import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { VehicleExpensesController } from './vehicle-expenses.controller';
import { VehicleExpensesService } from './vehicle-expenses.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [VehicleExpensesController],
  providers: [VehicleExpensesService],
  exports: [VehicleExpensesService],
})
export class VehicleExpensesModule {}
