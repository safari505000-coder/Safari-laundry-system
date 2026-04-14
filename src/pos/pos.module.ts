import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PosController],
  providers: [PosService],
})
export class PosModule {}
