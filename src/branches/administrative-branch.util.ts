import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SafariRole } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/** Roles that may see administrative branches in `/api/branches` and use them in finance UIs. */
const ROLES_THAT_SEE_ADMINISTRATIVE_BRANCHES: SafariRole[] = [
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.ACCOUNTANT,
];

export function canSeeAdministrativeBranches(role: string): boolean {
  return ROLES_THAT_SEE_ADMINISTRATIVE_BRANCHES.includes(role as SafariRole);
}

type DbClient = Pick<PrismaService, 'branch' | 'user'>;

export async function assertBranchOperationalForCommerce(
  prisma: DbClient,
  branchId: string,
): Promise<void> {
  const b = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { isAdministrative: true },
  });
  if (!b) {
    throw new NotFoundException('Branch not found');
  }
  if (b.isAdministrative) {
    throw new BadRequestException(
      'This branch is administrative-only: sales, purchase orders, and POS are disabled.',
    );
  }
}

/**
 * Blocks POS / quick-order / checkout when the acting user belongs to an
 * administrative branch (must have no such assignments per policy).
 */
export async function assertUserNotOnAdministrativeBranchForSales(
  prisma: DbClient,
  userId: string,
): Promise<void> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      branchId: true,
      branch: { select: { isAdministrative: true } },
    },
  });
  if (!u) {
    throw new NotFoundException('User not found');
  }
  if (u.branchId && u.branch?.isAdministrative) {
    throw new BadRequestException(
      'Orders and POS are not allowed for users assigned to the administrative branch.',
    );
  }
}
