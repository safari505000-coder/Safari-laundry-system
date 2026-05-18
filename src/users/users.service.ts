import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuditStatus, Prisma, SafariRole } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { assertPasswordStrength } from './password-policy';

const userPublicSelect = {
  id: true,
  username: true,
  fullName: true,
  // Added via migration.
  isActive: true,
  employeeId: true,
  jobTitle: true,
  phone: true,
  safariRole: true,
  roleId: true,
  branchId: true,
  createdAt: true,
  updatedAt: true,
  // V19.17 — salary defaults surfaced for the payroll registry page.
  basicMonthlySalary: true,
  monthlyAllowances: true,
  payrollRosterLineOrder: true,
  bankName: true,
  bankIban: true,
  mustChangePassword: true,
  passwordUpdatedAt: true,
  role: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true, location: true } },
};

export type UserPublic = Prisma.UserGetPayload<{ select: Prisma.UserSelect }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  private async resolveRoleId(safariRole: SafariRole): Promise<string> {
    const role = await this.prisma.role.findUnique({
      where: { name: safariRole },
    });
    if (!role) {
      throw new BadRequestException(
        `Institutional role "${safariRole}" is not seeded — run prisma db seed`,
      );
    }
    return role.id;
  }

  /**
   * ينشئ مستخدماً جديداً بصلاحية وفرع تشغيلي، مع منع التكرار وتقوية كلمة المرور عبر المسار الإداري.
   * Creates a new user for an operational branch and role while enforcing uniqueness through the admin user flow.
   * @param dto - بيانات المستخدم والدور والفرع / User, role, and branch creation payload
   * @returns سجل المستخدم العام بعد الإنشاء / Newly created public user record
   */
  async create(dto: CreateUserDto): Promise<UserPublic> {
    const username = dto.username.trim();
    const fullName = dto.fullName.trim();

    const existingUsername = await this.prisma.user.findUnique({
      where: { username },
    });
    if (existingUsername) {
      throw new ConflictException('A user with this username already exists');
    }

    if (dto.phone) {
      const phoneTaken = await this.prisma.user.findFirst({
        where: { phone: dto.phone },
      });
      if (phoneTaken) {
        throw new ConflictException(
          'A user with this phone number already exists',
        );
      }
    }

    const roleId = await this.resolveRoleId(dto.safariRole);
    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
      select: { isAdministrative: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    if (branch.isAdministrative) {
      throw new BadRequestException(
        'Users cannot be assigned to the administrative branch. Keep HQ as a cost center only; assign staff to an operational branch (payroll may still post to the administrative branch).',
      );
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);

    try {
      return await this.prisma.user.create({
        data: {
          username,
          fullName,
          password: passwordHash,
          safariRole: dto.safariRole,
          ...(dto.isActive !== undefined
            ? ({ isActive: dto.isActive } as Record<string, unknown>)
            : {}),
          roleId,
          branchId: dto.branchId,
          phone: dto.phone,
          ...(dto.jobTitle !== undefined
            ? {
                jobTitle: (() => {
                  const t = dto.jobTitle!.trim();
                  return t.length ? t : null;
                })(),
              }
            : {}),
          ...(dto.payrollRosterLineOrder !== undefined &&
          dto.payrollRosterLineOrder !== null
            ? { payrollRosterLineOrder: dto.payrollRosterLineOrder }
            : {}),
        },
        select: userPublicSelect as Prisma.UserSelect,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new NotFoundException('Role or branch not found');
      }
      throw e;
    }
  }

  /**
   * يعرض جميع المستخدمين للإدارة مع الدور والفرع وحقول الرواتب العامة.
   * Lists all users for administration with role, branch, and public payroll defaults.
   * @returns قائمة المستخدمين العامة مرتبة من الأحدث / Public users ordered newest first
   */
  async findAll(): Promise<UserPublic[]> {
    return this.prisma.user.findMany({
      select: userPublicSelect as Prisma.UserSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * يجلب مستخدماً واحداً بالمعرف أو يفشل إذا لم يوجد.
   * Fetches one user by id or fails when the user does not exist.
   * @param id - معرف المستخدم / User id
   * @returns سجل المستخدم العام / Public user record
   */
  async findOne(id: string): Promise<UserPublic> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userPublicSelect as Prisma.UserSelect,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /**
   * يحدّث بيانات المستخدم الإدارية مع حماية تكرار الاسم أو الهاتف وربط الدور والفرع.
   * Updates administrative user fields while protecting username/phone uniqueness and role/branch links.
   * @param id - معرف المستخدم المراد تعديله / Target user id
   * @param dto - الحقول المراد تعديلها / Partial user update payload
   * @returns سجل المستخدم العام بعد التعديل / Updated public user record
   */
  async update(id: string, dto: UpdateUserDto): Promise<UserPublic> {
    await this.findOne(id);

    if (dto.username !== undefined) {
      const u = dto.username.trim();
      const taken = await this.prisma.user.findFirst({
        where: { username: u, NOT: { id } },
      });
      if (taken) {
        throw new ConflictException('A user with this username already exists');
      }
    }

    if (dto.phone) {
      const phoneTaken = await this.prisma.user.findFirst({
        where: { phone: dto.phone, NOT: { id } },
      });
      if (phoneTaken) {
        throw new ConflictException(
          'A user with this phone number already exists',
        );
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.username !== undefined) data.username = dto.username.trim();
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.isActive !== undefined) {
      (data as unknown as Record<string, unknown>).isActive = dto.isActive;
    }
    if (dto.safariRole !== undefined) {
      const roleId = await this.resolveRoleId(dto.safariRole);
      data.safariRole = dto.safariRole;
      data.role = { connect: { id: roleId } };
    }
    const branchPatch = (dto as UpdateUserDto & { branchId?: string | null })
      .branchId;
    if (branchPatch !== undefined) {
      if (branchPatch === null) {
        throw new BadRequestException('branchId is mandatory for all staff');
      }
      const br = await this.prisma.branch.findUnique({
        where: { id: branchPatch },
        select: { isAdministrative: true },
      });
      if (!br) {
        throw new NotFoundException('Branch not found');
      }
      if (br.isAdministrative) {
        throw new BadRequestException(
          'Users cannot be assigned to the administrative branch.',
        );
      }
      data.branch =
        { connect: { id: branchPatch } };
    }
    if (dto.password !== undefined) {
      assertPasswordStrength(dto.password);
      data.password = await bcrypt.hash(dto.password, 10);
      data.mustChangePassword = false;
      data.passwordUpdatedAt = new Date();
    }
    if (dto.payrollRosterLineOrder !== undefined) {
      data.payrollRosterLineOrder = dto.payrollRosterLineOrder;
    }
    if (dto.jobTitle !== undefined) {
      const t = dto.jobTitle.trim();
      data.jobTitle = t.length ? t : null;
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data,
        select: userPublicSelect as Prisma.UserSelect,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new NotFoundException('Role or branch not found');
      }
      throw e;
    }
  }

  /**
   * Flip a user's `isActive` flag without touching role/branch/password.
   * OWNER accounts are protected from deactivation so the Owner can
   * never lock themselves out via a GM action. Anything else is fair
   * game for the Owner and General Manager.
   */
  async setActive(
    id: string,
    isActive: boolean,
  ): Promise<UserPublic> {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, safariRole: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }
    if (existing.safariRole === SafariRole.OWNER && !isActive) {
      throw new ForbiddenException('Owner accounts cannot be deactivated');
    }
    return this.prisma.user.update({
      where: { id },
      data: { isActive } as unknown as Prisma.UserUpdateInput,
      select: userPublicSelect as Prisma.UserSelect,
    });
  }

  /**
   * V19.17 — Dedicated endpoint for the payroll registry page.
   * Updates the two salary defaults (`basicMonthlySalary`,
   * `monthlyAllowances`) that seed every payroll row for this user.
   * Kept separate from the generic `update()` so the audit trail
   * clearly distinguishes "HR change" vs. "payroll rate change".
   *
   * Null/undefined values clear the default (fall back to the
   * explicitly entered payroll row amounts).
   */
  async updateSalaryDefaults(
    id: string,
    dto: {
      basicMonthlySalary?: number | null;
      monthlyAllowances?: number | null;
      payrollRosterLineOrder?: number | null;
      bankName?: string | null;
      bankIban?: string | null;
    },
  ): Promise<UserPublic> {
    await this.findOne(id);
    const data: Prisma.UserUpdateInput = {};
    if (dto.basicMonthlySalary !== undefined) {
      data.basicMonthlySalary =
        dto.basicMonthlySalary === null
          ? null
          : new Prisma.Decimal(dto.basicMonthlySalary.toFixed(4));
    }
    if (dto.monthlyAllowances !== undefined) {
      data.monthlyAllowances =
        dto.monthlyAllowances === null
          ? null
          : new Prisma.Decimal(dto.monthlyAllowances.toFixed(4));
    }
    if (dto.payrollRosterLineOrder !== undefined) {
      data.payrollRosterLineOrder = dto.payrollRosterLineOrder;
    }
    if (dto.bankName !== undefined) {
      const v = dto.bankName?.trim();
      data.bankName = v && v.length > 0 ? v : null;
    }
    if (dto.bankIban !== undefined) {
      const raw = dto.bankIban?.replace(/\s/g, '').trim();
      data.bankIban = raw && raw.length > 0 ? raw : null;
    }
    return this.prisma.user.update({
      where: { id },
      data,
      select: userPublicSelect as Prisma.UserSelect,
    });
  }

  /**
   * يحذف مستخدماً غير مالك فقط إذا لم تكن عليه سجلات تشغيلية أو مالية مرتبطة.
   * Deletes a non-owner user only when no operational or financial records reference it.
   * @param id - معرف المستخدم المراد حذفه / Target user id
   * @returns نتيجة الحذف ومعرف المستخدم / Deletion result with the user id
   */
  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, safariRole: true, username: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.safariRole === SafariRole.OWNER) {
      throw new ForbiddenException('Owner accounts cannot be deleted');
    }

    const refs = await this.prisma.$transaction([
      this.prisma.shift.count({ where: { driverId: id } }),
      this.prisma.order.count({ where: { driverId: id } }),
      this.prisma.bankDepositLog.count({
        where: {
          OR: [{ uploadedById: id }, { verifiedByAccountantId: id }],
        },
      }),
      this.prisma.branchExpense.count({ where: { recordedById: id } }),
      this.prisma.payroll.count({ where: { userId: id } }),
    ]);
    const hasReferences = refs.some((n) => n > 0);
    if (hasReferences) {
      throw new ConflictException(
        'Cannot delete this user because financial/operational records reference it. Deactivate the account instead.',
      );
    }

    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new ConflictException(
          'Cannot delete this user because related records still exist. Deactivate the account instead.',
        );
      }
      throw e;
    }
    return { id, deleted: true };
  }

  /**
   * يعيد تعيين كلمة مرور مستخدم من قبل الإدارة ويلغي جلساته ويفرض تغييرها عند الدخول التالي.
   * Resets a user's password through an administrative role, revokes sessions, and requires a change on next login.
   * @param targetUserId - معرف المستخدم الهدف / Target user id
   * @param newPassword - كلمة المرور الجديدة / New password
   * @param actorUserId - معرف المستخدم المنفذ / Acting user id
   * @param actorRole - دور المستخدم المنفذ / Acting user role
   * @returns سجل المستخدم العام بعد إعادة التعيين / Updated public user record
   */
  async resetPassword(
    targetUserId: string,
    newPassword: string,
    actorUserId: string,
    actorRole: string,
  ): Promise<UserPublic> {
    assertPasswordStrength(newPassword);
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, safariRole: true },
    });
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (target.safariRole === SafariRole.OWNER) {
      const actor = await this.prisma.user.findUnique({
        where: { id: actorUserId },
        select: { safariRole: true },
      });
      if (actor?.safariRole !== SafariRole.OWNER) {
        throw new ForbiddenException(
          'Only OWNER may reset another OWNER password.',
        );
      }
    }
    const hash = await bcrypt.hash(newPassword, 10);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.user.update({
        where: { id: targetUserId },
        data: {
          password: hash,
          mustChangePassword: true,
          passwordUpdatedAt: now,
        },
      }),
    ]);
    this.auditLogs.log({
      userId: actorUserId,
      role: actorRole,
      action: 'USER_PASSWORD_RESET',
      resource: 'users',
      endpoint: null,
      method: null,
      status: AuditStatus.SUCCESS,
      changes: {
        actorUserId,
        targetUserId,
      },
    });
    return this.findOne(targetUserId);
  }

  /**
   * يعيد تعيين كلمات مرور عدة مستخدمين بنفس قواعد مسار إعادة التعيين الفردي.
   * Resets passwords for multiple users using the same safeguards as the single-user reset flow.
   * @param userIds - معرفات المستخدمين المستهدفين / Target user ids
   * @param newPassword - كلمة المرور الجديدة المشتركة / Shared new password
   * @param actorUserId - معرف المستخدم المنفذ / Acting user id
   * @param actorRole - دور المستخدم المنفذ / Acting user role
   * @returns عدد الحسابات التي تم تحديثها / Number of updated accounts
   */
  async resetPasswordsBulk(
    userIds: string[],
    newPassword: string,
    actorUserId: string,
    actorRole: string,
  ): Promise<{ updated: number }> {
    const unique = [...new Set(userIds)];
    let updated = 0;
    for (const id of unique) {
      await this.resetPassword(id, newPassword, actorUserId, actorRole);
      updated += 1;
    }
    return { updated };
  }

  /**
   * يفرض تغيير كلمة المرور بواسطة صاحب الحساب بعد التحقق من كلمة المرور الحالية.
   * Forces an account-owner password change after validating the current password.
   * @param userId - معرف صاحب الحساب / Account owner user id
   * @param oldPassword - كلمة المرور الحالية / Current password
   * @param newPassword - كلمة المرور الجديدة / New password
   * @returns لا تُرجع قيمة / No return value
   */
  async forceChangePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    assertPasswordStrength(newPassword);
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });
    if (!row) {
      throw new NotFoundException('User not found');
    }
    const valid = await bcrypt.compare(oldPassword, row.password);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const hash = await bcrypt.hash(newPassword, 10);
    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hash,
        mustChangePassword: false,
        passwordUpdatedAt: now,
      },
    });
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { safariRole: true },
    });
    this.auditLogs.log({
      userId,
      role: actor?.safariRole ?? null,
      action: 'USER_PASSWORD_CHANGED',
      resource: 'auth',
      endpoint: null,
      method: null,
      status: AuditStatus.SUCCESS,
      changes: {
        actorUserId: userId,
        targetUserId: userId,
      },
    });
  }
}
