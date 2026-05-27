import { Injectable, Logger } from '@nestjs/common';

export type ExpoPushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[\w-]+\]$/.test(token.trim());
}

@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);
  private readonly mock = process.env.EXPO_PUSH_MOCK === 'true';
  private readonly disabled = process.env.EXPO_PUSH_ENABLED === 'false';

  async sendToToken(
    token: string | null | undefined,
    payload: ExpoPushPayload,
  ): Promise<boolean> {
    const trimmed = token?.trim();
    if (!trimmed || this.disabled) {
      return false;
    }
    if (!isExpoPushToken(trimmed)) {
      this.logger.warn('Skipping invalid Expo push token');
      return false;
    }

    if (this.mock) {
      this.logger.log(
        `[EXPO_PUSH_MOCK] ${payload.title} — ${payload.body} → ${trimmed.slice(0, 24)}…`,
      );
      return true;
    }

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: trimmed,
          sound: 'default',
          title: payload.title,
          body: payload.body,
          data: payload.data,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(
          `Expo push HTTP ${res.status}: ${text.slice(0, 200)}`,
        );
        return false;
      }
      const body = (await res.json()) as {
        data?: { status?: string; message?: string };
      };
      if (body.data?.status === 'error') {
        this.logger.warn(
          `Expo push ticket error: ${body.data.message ?? 'unknown'}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(
        `Expo push send failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }
}
