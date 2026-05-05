/**
 * OwnerAlertNotifierService
 *
 * Sends a WhatsApp alert to the OWNER phone via the Safari platform's
 * existing Moatmt gateway (`https://moatmt.sa/api/send`). Falls back
 * to an outbound webhook (`SYSTEM_GUARDIAN_WEBHOOK_URL` or
 * `CUSTOMER_NOTIFY_WEBHOOK_URL`) when Moatmt is unavailable, and
 * finally to a structured log entry so the alert is never lost.
 *
 * STRICT contract:
 *   - Never throws — failures return `false` and surface in the
 *     Guardian response so the dashboard can show that delivery
 *     failed without taking the request down.
 *   - Reads `SystemConfig` (operational table only — no financial
 *     state). The value is normalised through `parseKuwaitMobile965`
 *     so any new consumer of the value gets one canonical "Kuwait
 *     mobile" definition.
 *
 * Recipient resolution chain (per spec §4):
 *   1. `SystemConfigService.getGuardianPhone()`  (DB-configured)
 *   2. `SYSTEM_GUARDIAN_OWNER_PHONE` env          (legacy fallback)
 *   3. `null` → log a warning and skip the WhatsApp send safely.
 *
 * Provider env (all optional; the resolver short-circuits to log-only
 * when no provider is set, but the recipient resolver is independent
 * of the provider config):
 *   MOATMT_API_BASE_URL          default `https://moatmt.sa/api`
 *   MOATMT_INSTANCE_ID
 *   MOATMT_ACCESS_TOKEN
 *   SYSTEM_GUARDIAN_WEBHOOK_URL  outbound JSON webhook
 */
import { Injectable, Logger } from '@nestjs/common';
import { parseKuwaitMobile965 } from '../common/validation/kuwait-customer-phone';
import { SystemConfigService } from '../system-config/system-config.service';

export type OwnerAlertVia = 'moatmt' | 'webhook' | 'log' | 'skipped';

export type OwnerAlertResult = {
  delivered: boolean;
  via: OwnerAlertVia;
  error: string | null;
  /**
   * Recipient digits the dispatcher targeted. Empty string when the
   * resolver returned `null` and the send was skipped.
   */
  to: string;
  /** Where the recipient phone came from. */
  source: 'database' | 'env' | 'none';
};

const DEFAULT_MOATMT_BASE = 'https://moatmt.sa/api';
const HTTP_TIMEOUT_MS = 8_000;

@Injectable()
export class OwnerAlertNotifierService {
  private readonly logger = new Logger(OwnerAlertNotifierService.name);

  constructor(private readonly config: SystemConfigService) {}

  /**
   * Best-effort delivery. The boolean signals whether ANY upstream
   * (Moatmt or webhook) accepted the message; a `false` here is
   * authoritative — the caller should surface it to the operator.
   *
   * When NO recipient is configured (DB empty AND env unset), the
   * notifier returns `via: 'skipped'` with `delivered: false`. It
   * NEVER throws. Callers MUST treat `skipped` the same as a benign
   * log entry — the Guardian still records the sweep.
   */
  async send(message: string): Promise<OwnerAlertResult> {
    const resolved = await this.config.resolveGuardianPhone();
    if (!resolved.phone) {
      this.logger.warn(
        '[guardian-notify] skipped: no recipient configured (set SystemConfig.guardianPhone or SYSTEM_GUARDIAN_OWNER_PHONE)',
      );
      return {
        delivered: false,
        via: 'skipped',
        error: 'no_recipient_configured',
        to: '',
        source: 'none',
      };
    }
    const digits = resolved.phone;
    const source = resolved.source === 'none' ? 'none' : resolved.source;

    const moatmt = await this.tryMoatmt(digits, message);
    if (moatmt.delivered) return { ...moatmt, source };

    const webhook = await this.tryWebhook(digits, message);
    if (webhook.delivered) return { ...webhook, source };

    // Last-resort: structured log so alerts are still searchable in
    // the platform's log aggregator even when WhatsApp is unreachable.
    this.logger.warn(
      JSON.stringify({
        event: 'guardian_alert_log_only',
        to: maskPhone(digits),
        bodyPreview: message.slice(0, 200),
        moatmtError: moatmt.error,
        webhookError: webhook.error,
        source,
      }),
    );
    return {
      delivered: false,
      via: 'log',
      error: moatmt.error ?? webhook.error ?? 'no_provider_configured',
      to: digits,
      source,
    };
  }

  isProviderConfigured(): boolean {
    const hasMoatmt =
      Boolean(process.env.MOATMT_INSTANCE_ID?.trim()) &&
      Boolean(process.env.MOATMT_ACCESS_TOKEN?.trim());
    const hasWebhook =
      Boolean(process.env.SYSTEM_GUARDIAN_WEBHOOK_URL?.trim()) ||
      Boolean(process.env.CUSTOMER_NOTIFY_WEBHOOK_URL?.trim());
    return hasMoatmt || hasWebhook;
  }

  /**
   * Returns the masked active recipient (and its source) so the
   * Guardian's status payload + boot log can show where alerts will
   * land without leaking the full phone number.
   */
  async ownerPhoneMasked(): Promise<{
    masked: string | null;
    source: 'database' | 'env' | 'none';
  }> {
    const resolved = await this.config.resolveGuardianPhone();
    return {
      masked: resolved.phone ? maskPhone(resolved.phone) : null,
      source: resolved.source,
    };
  }

  // ─── providers ───────────────────────────────────────────────

  private async tryMoatmt(
    digits: string,
    text: string,
  ): Promise<Omit<OwnerAlertResult, 'source'>> {
    const accessToken = process.env.MOATMT_ACCESS_TOKEN?.trim();
    const instanceId = process.env.MOATMT_INSTANCE_ID?.trim();
    if (!accessToken || !instanceId) {
      return {
        delivered: false,
        via: 'moatmt',
        error: 'moatmt_creds_missing',
        to: digits,
      };
    }
    const base = (
      process.env.MOATMT_API_BASE_URL?.trim() || DEFAULT_MOATMT_BASE
    ).replace(/\/$/, '');
    // Mirrors customer-notifications: the auth pair goes both in the
    // query string and the JSON body so we work with whichever
    // verification mode the panel is on.
    const params = new URLSearchParams({
      access_token: accessToken,
      instance_id: instanceId,
      number: digits,
    });
    const url = `${base}/send?${params.toString()}`;
    const body = {
      number: digits,
      type: 'text' as const,
      message: text,
      instance_id: instanceId,
      access_token: accessToken,
    };
    const res = await this.postJson(url, body);
    if (res.ok) {
      return { delivered: true, via: 'moatmt', error: null, to: digits };
    }
    return {
      delivered: false,
      via: 'moatmt',
      error: `moatmt_${res.status}:${truncate(res.text, 200)}`,
      to: digits,
    };
  }

  private async tryWebhook(
    digits: string,
    text: string,
  ): Promise<Omit<OwnerAlertResult, 'source'>> {
    const webhook =
      process.env.SYSTEM_GUARDIAN_WEBHOOK_URL?.trim() ||
      process.env.CUSTOMER_NOTIFY_WEBHOOK_URL?.trim();
    if (!webhook) {
      return {
        delivered: false,
        via: 'webhook',
        error: 'webhook_unset',
        to: digits,
      };
    }
    const res = await this.postJson(webhook, {
      to: digits,
      message: text,
      template: 'system_guardian_alert',
    });
    if (res.ok) {
      return { delivered: true, via: 'webhook', error: null, to: digits };
    }
    return {
      delivered: false,
      via: 'webhook',
      error: `webhook_${res.status}:${truncate(res.text, 200)}`,
      to: digits,
    };
  }

  private async postJson(
    url: string,
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; status: number; text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await r.text().catch(() => '');
      return { ok: r.ok, status: r.status, text };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, status: 0, text: msg };
    } finally {
      clearTimeout(timer);
    }
  }
}

function maskPhone(digits: string): string {
  if (digits.length < 6) return '***';
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}
