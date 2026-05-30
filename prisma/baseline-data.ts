/**
 * Safari Fast Group — permanent corporate baseline (branches, staff, subscriptions).
 *
 * Sourced from production (Railway) as of 2026-05-29. Stable UUIDs preserve
 * FK consistency across `migrate reset` + re-seed cycles.
 *
 * Idempotent: safe to run on every `prisma db seed`.
 * Password policy mirrors `prisma/seed.ts`:
 *   - Dev (`SEED_RESET_PASSWORDS=true`): password = username
 *   - Production: existing password hash is never overwritten
 */
import * as bcrypt from 'bcrypt';
import { PrismaClient, SafariRole } from '@prisma/client';

/** Operational + HQ admin cost-center branches. */
export const BASELINE_BRANCHES = [
  {
    id: 'bf0330d3-c72b-45a5-8856-2f120ff22a71',
    name: 'الرقعي',
    location: 'الفروانية',
    phone: '22200299',
    isActive: true,
    isAdministrative: false,
    payrollRosterSortOrder: null as number | null,
  },
  {
    id: 'e9e75c8b-2a6e-4d9e-9092-b56f622d4e06',
    name: 'شركة مجموعة سفاري',
    location: 'الفروانية',
    phone: null as string | null,
    isActive: true,
    isAdministrative: true,
    payrollRosterSortOrder: null as number | null,
  },
] as const;

/** Operational login accounts (excludes bootstrap `admin` — seeded in seed.ts). */
export const BASELINE_STAFF = [
  {
    id: '05eba21b-86f2-4103-aca5-8d9c0d183ce1',
    username: '512',
    fullName: 'عرفات',
    safariRole: SafariRole.MANAGER,
    branchId: 'bf0330d3-c72b-45a5-8856-2f120ff22a71',
    jobTitle: null as string | null,
    isActive: true,
  },
  {
    id: 'a9eef59d-aed1-4cb3-8b1c-158fb243eace',
    username: '511',
    fullName: 'سيد',
    safariRole: SafariRole.DRIVER,
    branchId: 'bf0330d3-c72b-45a5-8856-2f120ff22a71',
    jobTitle: null,
    isActive: true,
  },
  {
    id: '58f9d443-cd08-4eb8-9b7c-71f7ab267b43',
    username: '513',
    fullName: 'سها',
    safariRole: SafariRole.CALL_CENTER,
    branchId: 'bf0330d3-c72b-45a5-8856-2f120ff22a71',
    jobTitle: null,
    isActive: true,
  },
  {
    id: '35c35d38-6534-4c87-8d79-c5f9b559b198',
    username: '515',
    fullName: 'احمد',
    safariRole: SafariRole.ACCOUNTANT,
    branchId: 'bf0330d3-c72b-45a5-8856-2f120ff22a71',
    jobTitle: null,
    isActive: true,
  },
  {
    id: '237d56aa-dde8-4a7b-ba37-1b3eff4045dc',
    username: '500',
    fullName: 'حمد العتيبي',
    safariRole: SafariRole.SUPERVISOR,
    branchId: 'bf0330d3-c72b-45a5-8856-2f120ff22a71',
    jobTitle: 'admin',
    isActive: true,
  },
  {
    id: '1a991946-7dd8-4535-8c89-df1d4b008dce',
    username: '520',
    fullName: 'ثامر',
    safariRole: SafariRole.GENERAL_MANAGER,
    branchId: 'bf0330d3-c72b-45a5-8856-2f120ff22a71',
    jobTitle: null,
    isActive: true,
  },
] as const;

export const BASELINE_SUBSCRIPTION_PLANS = [
  {
    id: '7bc11b9a-b8a3-4888-8072-44de513be03e',
    name: 'الفضية',
    salePrice: '20.0000',
    actualBalance: '25.0000',
    validityDays: 30,
    isActive: true,
  },
] as const;

export async function seedBaselineBranches(prisma: PrismaClient): Promise<void> {
  for (const branch of BASELINE_BRANCHES) {
    await prisma.branch.upsert({
      where: { id: branch.id },
      create: branch,
      update: {
        name: branch.name,
        location: branch.location,
        phone: branch.phone,
        isActive: branch.isActive,
        isAdministrative: branch.isAdministrative,
        payrollRosterSortOrder: branch.payrollRosterSortOrder,
      },
    });
  }
  console.info(`Ensured ${BASELINE_BRANCHES.length} baseline branches.`);
}

export async function seedBaselineStaff(
  prisma: PrismaClient,
  resetPasswords: boolean,
): Promise<void> {
  const roleIds = new Map<SafariRole, string>();
  for (const roleName of new Set(BASELINE_STAFF.map((s) => s.safariRole))) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: roleName },
      select: { id: true },
    });
    roleIds.set(roleName, role.id);
  }

  for (const staff of BASELINE_STAFF) {
    const roleId = roleIds.get(staff.safariRole)!;
    const passwordHash = await bcrypt.hash(staff.username, 12);

    await prisma.user.upsert({
      where: { username: staff.username },
      create: {
        id: staff.id,
        username: staff.username,
        fullName: staff.fullName,
        password: passwordHash,
        safariRole: staff.safariRole,
        roleId,
        branchId: staff.branchId,
        jobTitle: staff.jobTitle,
        isActive: staff.isActive,
      },
      update: {
        fullName: staff.fullName,
        safariRole: staff.safariRole,
        roleId,
        branchId: staff.branchId,
        jobTitle: staff.jobTitle,
        isActive: staff.isActive,
        ...(resetPasswords ? { password: passwordHash } : {}),
      },
    });
  }
  console.info(
    `Ensured ${BASELINE_STAFF.length} baseline staff users` +
      (resetPasswords
        ? ' (password = username — dev mode).'
        : ' (passwords preserved — production mode).'),
  );
}

export async function seedBaselineSubscriptionPlans(
  prisma: PrismaClient,
): Promise<void> {
  for (const plan of BASELINE_SUBSCRIPTION_PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { id: plan.id },
      create: plan,
      update: {
        name: plan.name,
        salePrice: plan.salePrice,
        actualBalance: plan.actualBalance,
        validityDays: plan.validityDays,
        isActive: plan.isActive,
      },
    });
  }
  console.info(
    `Ensured ${BASELINE_SUBSCRIPTION_PLANS.length} baseline subscription plan(s).`,
  );
}
