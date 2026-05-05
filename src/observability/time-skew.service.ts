import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DiscordAlertService } from '../common/services/discord-alert.service';

const DRIFT_WARN_MS = Number.parseInt(process.env.TIME_SKEW_WARN_MS ?? '2000', 10) || 2_000;

@Injectable()
export class TimeSkewService {
  private readonly logger = new Logger(TimeSkewService.name);

  constructor(private readonly discord: DiscordAlertService) {}

  @Interval(120_000)
  async check(): Promise<void> {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 5_000);
      const r = await fetch('https://worldtimeapi.org/api/timezone/UTC', {
        signal: ac.signal,
      });
      clearTimeout(t);
      if (!r.ok) {
        return;
      }
      const j = (await r.json()) as { unixtime?: number };
      if (typeof j.unixtime !== 'number') {
        return;
      }
      const remoteMs = j.unixtime * 1000;
      const drift = Math.abs(Date.now() - remoteMs);
      if (drift > DRIFT_WARN_MS) {
        this.logger.warn(
          JSON.stringify({
            event: 'ops_time_skew',
            traceId: undefined,
            orderId: undefined,
            driftMs: drift,
          }),
        );
        this.discord.enqueue('ops_time_skew', { driftMs: drift, timestamp: Date.now() });
      }
    } catch {
      /* no NTP endpoint — skip silently */
    }
  }
}
