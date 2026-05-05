import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import {
  DISCORD_ALERT_DLQ_QUEUE,
  discordRedisConnection,
} from '../common/services/discord-alert.queue';
import { IntegrationCircuitBreakerService } from '../common/services/integration-circuit-breaker.service';
import { DiscordAlertService } from '../common/services/discord-alert.service';
import { WHATSAPP_DLQ_QUEUE } from '../customer-notifications/whatsapp.queue';

const DLQ_THRESHOLD = Number.parseInt(process.env.OPS_DLQ_ALERT_THRESHOLD ?? '30', 10) || 30;
const CIRCUIT_OPEN_ALERT_MS =
  Number.parseInt(process.env.OPS_CIRCUIT_OPEN_ALERT_MS ?? '120000', 10) || 120_000;

@Injectable()
export class SilenceBreakerService {
  private readonly logger = new Logger(SilenceBreakerService.name);
  private lastDlqAlert = 0;
  private lastCircuitAlert = new Map<string, number>();

  constructor(
    private readonly circuit: IntegrationCircuitBreakerService,
    private readonly discord: DiscordAlertService,
  ) {}

  @Interval(60_000)
  async tick(): Promise<void> {
    await this.checkDlqDepth();
    await this.checkCircuitDuration();
  }

  private async checkDlqDepth(): Promise<void> {
    const conn = discordRedisConnection();
    if (!conn) {
      return;
    }
    let total = 0;
    for (const name of [DISCORD_ALERT_DLQ_QUEUE, WHATSAPP_DLQ_QUEUE]) {
      const q = new Queue(name, { connection: conn });
      try {
        const [w, f] = await Promise.all([q.getWaitingCount(), q.getFailedCount()]);
        total += w + f;
      } finally {
        await q.close().catch(() => undefined);
      }
    }
    if (total < DLQ_THRESHOLD) {
      return;
    }
    const now = Date.now();
    if (now - this.lastDlqAlert < 300_000) {
      return;
    }
    this.lastDlqAlert = now;
    this.logger.error(
      JSON.stringify({
        event: 'ops_dlq_depth_alert',
        traceId: undefined,
        orderId: undefined,
        total,
        threshold: DLQ_THRESHOLD,
      }),
    );
    this.discord.enqueue('ops_dlq_depth_alert', {
      total,
      threshold: DLQ_THRESHOLD,
      timestamp: now,
    });
  }

  private async checkCircuitDuration(): Promise<void> {
    const now = Date.now();
    for (const name of ['discord', 'whatsapp'] as const) {
      const r = await this.circuit.state(name);
      if (r.state !== 'OPEN') {
        continue;
      }
      if (!r.openedAt || now - r.openedAt < CIRCUIT_OPEN_ALERT_MS) {
        continue;
      }
      const last = this.lastCircuitAlert.get(name) ?? 0;
      if (now - last < 300_000) {
        continue;
      }
      this.lastCircuitAlert.set(name, now);
      this.logger.error(
        JSON.stringify({
          event: 'ops_circuit_open_prolonged',
          traceId: undefined,
          orderId: undefined,
          integration: name,
          openedMs: now - r.openedAt,
        }),
      );
      this.discord.enqueue('ops_circuit_open_prolonged', {
        integration: name,
        openedMs: now - r.openedAt,
        timestamp: now,
      });
    }
  }
}
