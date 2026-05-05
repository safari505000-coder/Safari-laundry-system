import { ForbiddenException } from '@nestjs/common';
import { SafariRole } from '@prisma/client';
import { assertInstitutionalMutationAllowed } from './institutional-mutation.util';

describe('assertInstitutionalMutationAllowed', () => {
  it('throws for GENERAL_MANAGER (enum)', () => {
    expect(() =>
      assertInstitutionalMutationAllowed(SafariRole.GENERAL_MANAGER),
    ).toThrow(ForbiddenException);
  });

  it('throws for GENERAL_MANAGER (string)', () => {
    expect(() => assertInstitutionalMutationAllowed('general_manager')).toThrow(
      ForbiddenException,
    );
  });

  it('allows ACCOUNTANT', () => {
    expect(() =>
      assertInstitutionalMutationAllowed(SafariRole.ACCOUNTANT),
    ).not.toThrow();
  });
});
