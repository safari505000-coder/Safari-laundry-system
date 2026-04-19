import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ShiftCycleService } from './shift-cycle.service';
import { ShiftsController } from './shifts.controller';

@Module({
  imports: [PrismaModule],
  providers: [ShiftCycleService],
  controllers: [ShiftsController],
  exports: [ShiftCycleService],
})
export class ShiftsModule {}
