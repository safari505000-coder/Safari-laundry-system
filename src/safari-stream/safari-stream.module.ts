import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SafariStreamController } from './safari-stream.controller';
import { SafariStreamService } from './safari-stream.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SafariStreamController],
  providers: [SafariStreamService],
  exports: [SafariStreamService],
})
export class SafariStreamModule {}
