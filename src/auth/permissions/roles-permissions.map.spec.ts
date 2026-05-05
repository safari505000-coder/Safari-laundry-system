import { SafariRole } from '@prisma/client';
import { AppPermission } from './permissions.enum';
import { permissionsForRole } from './roles-permissions.map';

describe('ROLE_PERMISSIONS (customers.view)', () => {
  it('MANAGER does not include VIEW_CUSTOMERS', () => {
    expect(permissionsForRole(SafariRole.MANAGER)).not.toContain(
      AppPermission.VIEW_CUSTOMERS,
    );
  });

  it('ACCOUNTANT includes VIEW_CUSTOMERS', () => {
    expect(permissionsForRole(SafariRole.ACCOUNTANT)).toContain(
      AppPermission.VIEW_CUSTOMERS,
    );
  });

  it('CUSTOMER includes VIEW_CUSTOMERS', () => {
    expect(permissionsForRole(SafariRole.CUSTOMER)).toContain(
      AppPermission.VIEW_CUSTOMERS,
    );
  });

  it('OWNER includes VIEW_CUSTOMERS (full matrix)', () => {
    expect(permissionsForRole(SafariRole.OWNER)).toContain(
      AppPermission.VIEW_CUSTOMERS,
    );
  });
});
