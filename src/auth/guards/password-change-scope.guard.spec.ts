import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PasswordChangeScopeGuard } from './password-change-scope.guard';

function mockContext(
  method: string,
  originalUrl: string,
  tokenPurpose?: string,
): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        originalUrl,
        user: tokenPurpose ? { tokenPurpose } : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('PasswordChangeScopeGuard', () => {
  const getAllAndOverride = jest.fn();
  let guard: PasswordChangeScopeGuard;

  beforeEach(() => {
    getAllAndOverride.mockReset();
    getAllAndOverride.mockReturnValue(undefined);
    guard = new PasswordChangeScopeGuard({
      getAllAndOverride,
    } as unknown as Reflector);
  });

  it('allows normal access tokens through', () => {
    expect(guard.canActivate(mockContext('GET', '/api/users'))).toBe(true);
  });

  it('allows password-change token only on change-password endpoint', () => {
    expect(
      guard.canActivate(
        mockContext(
          'POST',
          '/api/auth/change-password',
          'PASSWORD_CHANGE_ONLY',
        ),
      ),
    ).toBe(true);
  });

  it('blocks password-change token from browsing the app API', () => {
    expect(() =>
      guard.canActivate(
        mockContext('GET', '/api/users', 'PASSWORD_CHANGE_ONLY'),
      ),
    ).toThrow(ForbiddenException);
  });
});
