import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AuditStatus, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { DiscordAlertService } from '../common/services/discord-alert.service';
import type { RequestWithId } from '../common/middleware/request-id.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityStateService } from './security-state.service';
import type { AuditLogsQueryDto } from './dto/audit-logs-query.dto';
import type { AuditLogTimelineResponseDto } from './dto/audit-logs-timeline.dto';

type AuditRequest = RequestWithId &
  Request & {
    user?: { userId?: string; sub?: string; role?: string };
  };

type AuditInput = {
  userId?: string | null;
  role?: string | null;
  action: string;
  resource: string;
  customerId?: string | null;
  orderId?: string | null;
  amount?: string | number | null;
  source?: string | null;
  endpoint?: string | null;
  method?: string | null;
  status: AuditStatus;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  suspicious?: boolean;
  changes?: Record<string, unknown>;
};

const ONE_MINUTE_MS = 60_000;
const FORBIDDEN_THRESHOLD = 5;
const BLOCK_THRESHOLD = 8;
const TEMP_BLOCK_MS = 10 * 60_000;
const ALERT_COOLDOWN_MS = 60_000;
const SENSITIVE_IP_LIMIT = 10;

/**
 * 🔒 BANK-GRADE SECURITY LAYER
 * All access attempts must be audited and protected.
 * Unauthorized behavior must be detected and alerted.
 * DO NOT MODIFY WITHOUT SECURITY REVIEW.
 */
@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discordAlerts: DiscordAlertService,
    private readonly securityState: SecurityStateService,
  ) {}

  log(input: AuditInput): void {
    void this.write(input).catch((error: unknown) => {
      this.logger.warn(
        `audit_log_failed action=${input.action} reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  logFinancialEvent(input: {
    action:
      | 'ORDER_CREATED'
      | 'PAYMENT_MADE'
      | 'DEBT_PAYMENT'
      | 'CASH_HANDOVER_TRANSFER'
      | 'CASH_HANDOVER_REJECTED'
      | 'CASH_DEPOSIT_REGISTERED'
      | 'CASH_DEPOSIT_VERIFIED'
      | 'CASH_DEPOSIT_UNCOVERED'
      | 'DOUBLE_COUNT_DETECTED'
      | 'SUBSCRIPTION_SOURCE_ANOMALY'
      | 'OVERPAYMENT_DETECTED'
      | 'OVERRIDE_BLOCKED_CUSTOMER'
      | 'CUSTOMER_BLOCKED'
      | 'CUSTOMER_UNBLOCKED';
    customerId?: string | null;
    orderId?: string | null;
    amount?: string | number | null;
    source?: string | null;
    userId?: string | null;
    role?: string | null;
    changes?: Record<string, unknown>;
  }): void {
    this.log({
      userId: input.userId ?? null,
      role: input.role ?? null,
      action: input.action,
      resource: 'financial_event',
      customerId: input.customerId ?? null,
      orderId: input.orderId ?? null,
      amount: input.amount ?? null,
      source: input.source ?? null,
      status: AuditStatus.SUCCESS,
      changes: {
        customerId: input.customerId ?? null,
        orderId: input.orderId ?? null,
        amount: input.amount ?? null,
        source: input.source ?? null,
        ...(input.changes ?? {}),
      },
    });
  }

  logRequest(req: AuditRequest, statusCode: number): void {
    if (!this.shouldAuditRequest(req, statusCode)) {
      return;
    }
    const status =
      statusCode === 403 || statusCode === 429 ? AuditStatus.DENIED : AuditStatus.SUCCESS;
    this.log({
      userId: this.userId(req),
      role: req.user?.role ?? null,
      action: this.actionFor(req),
      resource: this.resourceFor(req),
      endpoint: this.endpoint(req),
      method: req.method,
      status,
      ip: this.ip(req),
      userAgent: this.userAgent(req),
      requestId: req.requestId ?? null,
      changes: { statusCode },
    });
    if (statusCode === 403) {
      void this.recordForbidden(req).catch((error: unknown) =>
        this.logger.warn(
          `audit_forbidden_record_failed reason=${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      );
    }
  }

  checkBlocked(req: AuditRequest): Promise<boolean> {
    return this.securityState.isBlocked(this.blockKeys(req));
  }

  async checkSensitiveRateLimit(req: AuditRequest): Promise<boolean> {
    if (!this.isSensitiveEndpoint(this.endpoint(req))) {
      return true;
    }
    const key = this.ip(req) ?? 'unknown';
    const hits = await this.securityState.incrementWindow(
      `ip:${key}:${this.endpoint(req)}`,
      60,
    );
    if (hits > SENSITIVE_IP_LIMIT) {
      this.alert('rate_limit_exceeded', req, {
        attempts: hits,
        endpoint: this.endpoint(req),
      });
      return false;
    }
    return true;
  }

  async checkFailedAttemptBudget(req: AuditRequest): Promise<boolean> {
    const key = this.actorKey(req);
    const attempts = await this.securityState.forbiddenAttempts(key, ONE_MINUTE_MS);
    if (attempts.length < FORBIDDEN_THRESHOLD) {
      return true;
    }
    this.alert('rate_limit_exceeded', req, {
      attempts: attempts.length,
      endpoints: [...new Set(attempts.map((attempt) => attempt.endpoint))],
    });
    return false;
  }

  auditDenied(req: AuditRequest, action: string, reason: string): void {
    this.log({
      userId: this.userId(req),
      role: req.user?.role ?? null,
      action,
      resource: this.resourceFor(req),
      endpoint: this.endpoint(req),
      method: req.method,
      status: AuditStatus.DENIED,
      ip: this.ip(req),
      userAgent: this.userAgent(req),
      requestId: req.requestId ?? null,
      suspicious: true,
      changes: { reason },
    });
  }

  private async write(input: AuditInput): Promise<void> {
    const payload = {
      actorId: input.userId ?? null,
      userId: input.userId ?? null,
      role: input.role ?? null,
      action: input.action,
      resource: input.resource,
      customerId: input.customerId ?? null,
      orderId: input.orderId ?? null,
      amount: input.amount ?? null,
      source: input.source ?? null,
      endpoint: input.endpoint ?? null,
      method: input.method ?? null,
      status: input.status,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      requestId: input.requestId ?? null,
      suspicious: input.suspicious ?? false,
      changes: input.changes ?? {},
      createdAt: new Date().toISOString(),
    };
    const previous = await this.prisma.auditLog.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { hash: true },
    });
    const prevHash = previous?.hash ?? 'GENESIS';
    const hash = this.auditHash(prevHash, payload);
    await this.prisma.auditLog.create({
      data: {
        userId: input.userId ?? undefined,
        actorId: input.userId ?? undefined,
        customerId: input.customerId ?? undefined,
        orderId: input.orderId ?? undefined,
        amount:
          input.amount != null ? new Prisma.Decimal(input.amount) : undefined,
        source: input.source ?? undefined,
        role: input.role ?? undefined,
        action: input.action,
        resource: input.resource,
        endpoint: input.endpoint ?? undefined,
        method: input.method ?? undefined,
        status: input.status,
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
        requestId: input.requestId ?? undefined,
        suspicious: input.suspicious ?? false,
        changes: (input.changes ?? {}) as Prisma.InputJsonValue,
        payload: payload as Prisma.InputJsonValue,
        prevHash,
        hash,
      },
    });
  }

  async verifyAuditIntegrity(): Promise<{ valid: boolean; checked: number; brokenAt?: string }> {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, payload: true, hash: true, prevHash: true },
    });
    let prevHash = 'GENESIS';
    for (const row of rows) {
      const expected = this.auditHash(prevHash, row.payload ?? {});
      if (row.prevHash !== prevHash || row.hash !== expected) {
        return { valid: false, checked: rows.length, brokenAt: row.id };
      }
      prevHash = row.hash ?? '';
    }
    return { valid: true, checked: rows.length };
  }

  async listTimeline(query: AuditLogsQueryDto): Promise<AuditLogTimelineResponseDto> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.orderId ? { orderId: query.orderId } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: query.driverId ? 500 : 100,
      select: {
        action: true,
        amount: true,
        source: true,
        userId: true,
        timestamp: true,
        payload: true,
        changes: true,
      },
    });
    const filtered =
      query.driverId ?
        rows.filter((row) =>
          jsonContainsValue(row.payload, query.driverId!) ||
          jsonContainsValue(row.changes, query.driverId!),
        )
      : rows;
    return {
      rows: filtered.slice(0, 100).map((row) => ({
        action: row.action,
        amount: row.amount?.toFixed(4) ?? null,
        source: row.source ?? null,
        userId: row.userId ?? null,
        timestamp: row.timestamp.toISOString(),
      })),
    };
  }

  private auditHash(prevHash: string, payload: unknown): string {
    return createHash('sha256')
      .update(prevHash)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  private async recordForbidden(req: AuditRequest): Promise<void> {
    const key = this.actorKey(req);
    const endpoint = this.endpoint(req);
    const attempts = await this.securityState.addForbiddenAttempt(
      key,
      endpoint,
      ONE_MINUTE_MS,
    );

    const endpoints = [...new Set(attempts.map((attempt) => attempt.endpoint))];
    if (attempts.length >= FORBIDDEN_THRESHOLD) {
      this.alert('repeated_forbidden_access', req, {
        attempts: attempts.length,
        endpoints,
      });
      this.alert('suspicious_activity_detected', req, {
        attempts: attempts.length,
        endpoints,
      });
    } else if (endpoints.length > 1) {
      this.alert('suspicious_activity_detected', req, {
        attempts: attempts.length,
        endpoints,
        reason: 'multiple_restricted_endpoints',
      });
    }

    if (attempts.length >= BLOCK_THRESHOLD) {
      await this.applyTemporaryBlock(req, attempts.length, endpoints);
    }
  }

  private async applyTemporaryBlock(
    req: AuditRequest,
    attempts: number,
    endpoints: string[],
  ): Promise<void> {
    const until = Date.now() + TEMP_BLOCK_MS;
    await this.securityState.block(this.blockKeys(req), until);
    this.alert('temporary_block_applied', req, {
      attempts,
      endpoints,
      blockedUntil: new Date(until).toISOString(),
    });
    this.auditDenied(req, 'TEMPORARY_BLOCK_APPLIED', 'suspicious_activity');
  }

  private alert(
    event: string,
    req: AuditRequest,
    extra: Record<string, unknown>,
  ): void {
    const cooldownKey = `${event}:${this.actorKey(req)}:${this.endpoint(req)}`;
    const now = Date.now();
    void this.securityState
      .acquireCooldown(cooldownKey, ALERT_COOLDOWN_MS)
      .then((allowed) => {
        if (!allowed) {
          return;
        }
        this.discordAlerts.enqueue(event, {
          userId: this.userId(req),
          role: req.user?.role ?? null,
          endpoint: this.endpoint(req),
          ip: this.ip(req),
          requestId: req.requestId,
          timestamp: now,
          ...extra,
        });
      })
      .catch(() => undefined);
  }

  private shouldAuditRequest(req: AuditRequest, statusCode: number): boolean {
    return (
      !!req.user ||
      this.isAuthEndpoint(this.endpoint(req)) ||
      this.isSensitiveEndpoint(this.endpoint(req)) ||
      statusCode === 403 ||
      statusCode === 429
    );
  }

  private actionFor(req: AuditRequest): string {
    const endpoint = this.endpoint(req);
    if (endpoint.includes('/auth/login')) return 'LOGIN';
    if (endpoint.includes('/auth/logout')) return 'LOGOUT';
    if (endpoint.includes('/collections')) return 'ACCESS_COLLECTIONS';
    if (endpoint.includes('/whatsapp')) return 'ACCESS_WHATSAPP';
    if (endpoint.includes('/admin')) return 'ACCESS_ADMIN';
    return 'ACCESS_PROTECTED_ENDPOINT';
  }

  private resourceFor(req: AuditRequest): string {
    const endpoint = this.endpoint(req);
    if (endpoint.includes('/collections')) return 'collections';
    if (endpoint.includes('/whatsapp')) return 'whatsapp_tools';
    if (endpoint.includes('/admin')) return 'admin';
    if (endpoint.includes('/auth')) return 'auth';
    return 'protected_endpoint';
  }

  private isAuthEndpoint(endpoint: string): boolean {
    return endpoint.includes('/auth/login') || endpoint.includes('/auth/logout');
  }

  private isSensitiveEndpoint(endpoint: string): boolean {
    return (
      endpoint.includes('/collections') ||
      endpoint.includes('/whatsapp') ||
      endpoint.includes('/admin') ||
      endpoint.includes('/auth/') ||
      endpoint.includes('/payments/callback') ||
      endpoint.includes('/payments/status') ||
      endpoint.includes('/call-center/operations-summary') ||
      endpoint.includes('/call-center/daily-collections') ||
      endpoint.includes('/call-center/orders/')
    );
  }

  private endpoint(req: AuditRequest): string {
    return req.originalUrl ?? req.url ?? '';
  }

  private userId(req: AuditRequest): string | null {
    return req.user?.userId ?? req.user?.sub ?? null;
  }

  private ip(req: AuditRequest): string | null {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0]?.trim() ?? null;
    }
    return req.ip ?? req.socket.remoteAddress ?? null;
  }

  private userAgent(req: AuditRequest): string | null {
    const userAgent = req.headers['user-agent'];
    return typeof userAgent === 'string' ? userAgent : null;
  }

  private actorKey(req: AuditRequest): string {
    return this.userId(req) ? `user:${this.userId(req)}` : `ip:${this.ip(req) ?? 'unknown'}`;
  }

  private blockKeys(req: AuditRequest): string[] {
    const keys = [`ip:${this.ip(req) ?? 'unknown'}`];
    const userId = this.userId(req);
    if (userId) {
      keys.push(`user:${userId}`);
    }
    return keys;
  }
}

function jsonContainsValue(value: unknown, expected: string): boolean {
  if (value === expected) return true;
  if (Array.isArray(value)) {
    return value.some((item) => jsonContainsValue(item, expected));
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) =>
      jsonContainsValue(item, expected),
    );
  }
  return false;
}
