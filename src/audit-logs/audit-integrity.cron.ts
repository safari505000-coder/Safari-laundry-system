import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DiscordAlertService } from '../common/services/discord-alert.service';
import { AuditLogsService } from './audit-logs.service';

@Injectable()
export class AuditIntegrityCron {
  private readonly logger = new Logger(AuditIntegrityCron.name);

  constructor(
    private readonly audit: AuditLogsService,
    private readonly discord: DiscordAlertService,
  ) {}

  @Cron('0 */10 * * * *')
  async verify(): Promise<void> {
    try {
      const r = await this.audit.verifyAuditIntegrity();
      if (!r.valid) {
        this.logger.error(
          JSON.stringify({
            event: 'audit_chain_corruption',
            traceId: undefined,
            orderId: undefined,
            checked: r.checked,
            brokenAt: r.brokenAt,
          }),
        );
        this.discord.enqueue('audit_chain_corruption', {
          issue: 'hash_chain_invalid',
          checked: r.checked,
          brokenAt: r.brokenAt,
          timestamp: Date.now(),
        });
      }
    } catch (e) {
      this.logger.error(
        `audit_integrity_cron_failed ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
