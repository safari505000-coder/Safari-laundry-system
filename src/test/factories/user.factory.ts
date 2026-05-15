import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { Prisma, PrismaClient, SafariRole, User } from '@prisma/client';
import { JWT_SECRET_DEV_FALLBACK } from '../../common/constants/jwt-secret-fallback';

type Db = PrismaClient | Prisma.TransactionClient;

export type TestUser = User & { jwtToken: string };

function roleNameFor(role: SafariRole): string {
  return role;
}

function phoneDigitsFromUuid(id: string): string {
  return id.replace(/\D/g, '').padEnd(7, '0').slice(0, 7);
}

export async function createUser(
  prisma: Db,
  role: SafariRole,
  branchId?: string | null,
  overrides: Partial<Prisma.UserCreateInput> = {},
): Promise<TestUser> {
  const id = randomUUID();
  const roleRecord = await prisma.role.upsert({
    where: { name: roleNameFor(role) },
    update: {},
    create: {
      id: randomUUID(),
      name: roleNameFor(role),
    },
  });

  const data = {
    id,
    username: `test-${role.toLowerCase()}-${id}`,
    password: 'test-password-hash',
    fullName: `Test ${role} ${id}`,
    phone: `9${phoneDigitsFromUuid(id)}`,
    safariRole: role,
    role: { connect: { id: roleRecord.id } },
    branch: branchId ? { connect: { id: branchId } } : undefined,
    isActive: true,
    ...overrides,
  } as Prisma.UserCreateInput;

  const user = await prisma.user.create({ data });

  const jwt = new JwtService({
    secret: process.env.JWT_SECRET ?? JWT_SECRET_DEV_FALLBACK,
  });
  const jwtToken = jwt.sign({
    sub: user.id,
    userId: user.id,
    username: user.username,
    role: user.safariRole,
    safariRole: user.safariRole,
    branchId: user.branchId,
    linkedCustomerId: user.linkedCustomerId,
  });

  return Object.assign(user, { jwtToken });
}
