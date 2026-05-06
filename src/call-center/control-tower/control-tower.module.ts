import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ControlTowerController } from './control-tower.controller';
import { ControlTowerService } from './control-tower.service';
import { ControlTowerStreamService } from './control-tower-stream.service';

@Module({
  imports: [PrismaModule],
  controllers: [ControlTowerController],
  providers: [ControlTowerService, ControlTowerStreamService],
  exports: [ControlTowerService],
})
export class ControlTowerModule {}
