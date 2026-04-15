import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FixedExpenseController } from './fixed-expense.controller';
import { FixedExpenseService } from './fixed-expense.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [FixedExpenseController],
  providers: [FixedExpenseService],
  exports: [FixedExpenseService],
})
export class FixedExpenseModule {}
