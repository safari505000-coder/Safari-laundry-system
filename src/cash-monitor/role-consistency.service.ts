/**
 * RoleConsistencyService — read-only audit of the dual-role columns.
 *
 * The User model carries TWO independent role sources of truth:
 *
 *   - `User.safariRole`  (SafariRole enum, used by every cash / finance
 *                         / RBAC service: cash.service, debt.service,
 *                         expenses.service, …)
 *   - `User.role.name`   (string from the relational `Role` table, used
 *                         by legacy paths: driver-oversight.service,
 *                         payroll, the seed scripts.)
 *
 * Both must agree for every active user. If they ever drift, that IS
 * the "role misclassification" path the brief warns about: a user
 * could be invisible to one screen but visible to another, a manager
 * could be selectable as a driver in payroll while still being
 * rejected by cash custody, etc.
 *
 * SAFETY POSTURE
 * --------------
 * READ-ONLY. NEVER auto-corrects. Same rationale as the rest of the
 * cash-safety cron: silent rewrites would HIDE the regression in the
 * producer (a seed script, a manual SQL fix, a half-applied migration)
 * and make the bug untraceable. A drift here is alerted; the engineer
 * fixes the producer at the source.
 */
import { Injectable, Logger } from '@nestjs/common';
import { SafariRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type RoleConsistencyMismatch = {
  userId: string;
  username: string;
  fullName: string;
  safariRole: SafariRole;
  /** Role row name; `null` only if the relation is somehow missing. */
  roleName: string | null;
  branchId: string | null;
  isActive: boolean;
};

export type RoleConsistencyReport = {
  status: 'PASS' | 'FAIL';
  totalActiveUsers: number;
  mismatches: RoleConsistencyMismatch[];
  generatedAt: string;
};

@Injectable()
export class RoleConsistencyService {
  private readonly logger = new Logger(RoleConsistencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(): Promise<RoleConsistencyReport> {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        username: true,
        fullName: true,
        safariRole: true,
        branchId: true,
        isActive: true,
        role: { select: { name: true } },
      },
    });

    const mismatches: RoleConsistencyMismatch[] = [];
    for (const u of users) {
      const roleName = u.role?.name ?? null;
      // The legacy Role table may use the same string keys as SafariRole;
      // a mismatch is anything where the two sides disagree (case-sensitive).
      if (roleName === null || roleName !== u.safariRole) {
        mismatches.push({
          userId: u.id,
          username: u.username,
          fullName: u.fullName,
          safariRole: u.safariRole,
          roleName,
          branchId: u.branchId,
          isActive: u.isActive,
        });
      }
    }

    const status: 'PASS' | 'FAIL' = mismatches.length === 0 ? 'PASS' : 'FAIL';
    if (status === 'FAIL') {
      this.logger.warn(
        JSON.stringify({
          event: 'role_consistency_drift',
          totalActiveUsers: users.length,
          mismatchCount: mismatches.length,
          sample: mismatches.slice(0, 5).map((m) => ({
            userId: m.userId,
            username: m.username,
            safariRole: m.safariRole,
            roleName: m.roleName,
          })),
        }),
      );
    }

    return {
      status,
      totalActiveUsers: users.length,
      mismatches,
      generatedAt: new Date().toISOString(),
    };
  }
}
