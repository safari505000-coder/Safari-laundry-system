import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountSecurityController } from './account-security.controller';
import { AccountSecurityLoginListener } from './account-security.listener';
import { AccountSecurityService } from './account-security.service';

/**
 * V10 HARDENING — MFA / sessions / devices / login history.
 * Additive: depends only on Prisma + the global AuditLogsService and the
 * global EventEmitter. Does not modify any existing module.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AccountSecurityController],
  providers: [AccountSecurityService, AccountSecurityLoginListener],
  exports: [AccountSecurityService],
})
export class AccountSecurityModule {}
