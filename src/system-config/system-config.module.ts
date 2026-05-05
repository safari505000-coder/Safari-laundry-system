/**
 * SystemConfigModule — Owner-only operational settings surface.
 *
 * Hosts the SINGLE-row `SystemConfig` Prisma model, the GET/POST API,
 * and the service consumed by the System Guardian's notifier to
 * resolve the WhatsApp recipient. NEVER touches financial state.
 *
 * Exports `SystemConfigService` so the System Guardian module can
 * inject it through a normal Nest dependency without re-wiring
 * Prisma.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemConfigController } from './system-config.controller';
import { SystemConfigService } from './system-config.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SystemConfigController],
  providers: [SystemConfigService],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
