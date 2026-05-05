import { Injectable, Logger } from '@nestjs/common';

export type LightweightAuditUser = {
  userId?: string | number | null;
  role?: string | null;
  branchId?: string | number | null;
  scope?: string | null;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  logAudit(
    action: string,
    user: LightweightAuditUser | null | undefined,
    metadata?: Record<string, unknown>,
  ): void {
    this.logger.log(
      JSON.stringify({
        event: 'audit_event',
        traceId: undefined,
        orderId: undefined,
        action,
        userId: user?.userId ?? null,
        role: user?.role ?? null,
        branchId: user?.branchId ?? null,
        scope: user?.scope ?? null,
        metadata: metadata ?? {},
        timestamp: new Date().toISOString(),
      }),
    );
  }
}
