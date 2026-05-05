import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SafariRole } from '@prisma/client';
import { GeneralManagerReadOnlyGuard } from './general-manager-read-only.guard';

function mockContext(
  method: string,
  role?: string,
): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ method, user: role ? { role } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe('GeneralManagerReadOnlyGuard', () => {
  let guard: GeneralManagerReadOnlyGuard;
  const getAllAndOverride = jest.fn();

  beforeEach(() => {
    getAllAndOverride.mockReset();
    guard = new GeneralManagerReadOnlyGuard({
      getAllAndOverride,
    } as unknown as Reflector);
  });

  it('allows @Public routes regardless of method', () => {
    getAllAndOverride.mockReturnValue('public');
    expect(
      guard.canActivate(mockContext('DELETE', SafariRole.GENERAL_MANAGER)),
    ).toBe(true);
  });

  it('allows GET for GENERAL_MANAGER', () => {
    getAllAndOverride.mockReturnValue(undefined);
    expect(
      guard.canActivate(mockContext('GET', SafariRole.GENERAL_MANAGER)),
    ).toBe(true);
  });

  it('allows HEAD / OPTIONS for GENERAL_MANAGER', () => {
    getAllAndOverride.mockReturnValue(undefined);
    expect(
      guard.canActivate(mockContext('HEAD', SafariRole.GENERAL_MANAGER)),
    ).toBe(true);
    expect(
      guard.canActivate(mockContext('OPTIONS', SafariRole.GENERAL_MANAGER)),
    ).toBe(true);
  });

  it('forbids POST for GENERAL_MANAGER', () => {
    getAllAndOverride.mockReturnValue(undefined);
    expect(() =>
      guard.canActivate(mockContext('POST', SafariRole.GENERAL_MANAGER)),
    ).toThrow(ForbiddenException);
  });

  it('forbids PATCH for GENERAL_MANAGER', () => {
    getAllAndOverride.mockReturnValue(undefined);
    expect(() =>
      guard.canActivate(mockContext('PATCH', SafariRole.GENERAL_MANAGER)),
    ).toThrow(ForbiddenException);
  });

  it('does not restrict other roles', () => {
    getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(mockContext('POST', SafariRole.ACCOUNTANT))).toBe(
      true,
    );
  });
});
