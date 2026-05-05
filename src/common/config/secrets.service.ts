import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosRequestConfig } from 'axios';

type CacheEntry = { value: string; exp: number };

/**
 * Production: set SECRETS_PROVIDER=aws | vault and wire credentials.
 * Development: falls back to process.env (plain .env acceptable only outside prod).
 */
@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private awsClient: import('@aws-sdk/client-secrets-manager').SecretsManagerClient | null =
    null;

  private ttlMs(): number {
    const n = Number.parseInt(process.env.SECRETS_CACHE_TTL_MS ?? '300000', 10);
    return Number.isFinite(n) && n > 0 ? n : 300_000;
  }

  async get(key: string): Promise<string | undefined> {
    if (process.env.NODE_ENV !== 'production') {
      return process.env[key];
    }
    const provider = (process.env.SECRETS_PROVIDER ?? '').toLowerCase();
    if (!provider) {
      this.logger.warn('SECRETS_PROVIDER unset in production — using env fallback (not recommended)');
      return process.env[key];
    }
    const now = Date.now();
    const hit = this.cache.get(key);
    if (hit && hit.exp > now) {
      return hit.value;
    }
    let value: string | undefined;
    if (provider === 'aws') {
      value = await this.loadAws(key);
    } else if (provider === 'vault') {
      value = await this.loadVault(key);
    } else {
      value = process.env[key];
    }
    if (value !== undefined) {
      this.cache.set(key, { value, exp: now + this.ttlMs() });
    }
    return value;
  }

  /** Invalidate cache entry after external rotation (optional hook). */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  private async loadAws(secretId: string): Promise<string | undefined> {
    try {
      const mod = await import('@aws-sdk/client-secrets-manager');
      if (!this.awsClient) {
        this.awsClient = new mod.SecretsManagerClient({
          region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
        });
      }
      const out = await this.awsClient.send(
        new mod.GetSecretValueCommand({ SecretId: secretId }),
      );
      if (out.SecretString) {
        return out.SecretString;
      }
      return undefined;
    } catch (e) {
      this.logger.error(`aws_secrets_failed id=${secretId} ${e instanceof Error ? e.message : e}`);
      return undefined;
    }
  }

  private async loadVault(secretLogicalKey: string): Promise<string | undefined> {
    const addr = process.env.VAULT_ADDR?.replace(/\/$/, '');
    const token = process.env.VAULT_TOKEN;
    const mountPath = (process.env.VAULT_KV_MOUNT ?? 'secret/data').replace(/^\/+|\/+$/g, '');
    if (!addr || !token) {
      return undefined;
    }
    const path = `${mountPath}/${secretLogicalKey}`.replace(/\/+/g, '/');
    const url = `${addr}/v1/${path}`;
    const cfg: AxiosRequestConfig = {
      method: 'GET',
      url,
      headers: { 'X-Vault-Token': token },
      timeout: 5_000,
      validateStatus: () => true,
    };
    try {
      const res = await axios.request<{
        data?: { data?: Record<string, unknown> };
      }>(cfg);
      if (res.status >= 200 && res.status < 300 && res.data?.data?.data) {
        const d = res.data.data.data as Record<string, unknown>;
        const field = process.env.VAULT_SECRET_FIELD ?? 'value';
        const raw = d[field] ?? d[Object.keys(d)[0] ?? ''];
        return raw === undefined || raw === null ? undefined : String(raw);
      }
      return undefined;
    } catch (e) {
      this.logger.error(`vault_secrets_failed ${e instanceof Error ? e.message : e}`);
      return undefined;
    }
  }
}
