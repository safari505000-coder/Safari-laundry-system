import { describe, expect, test } from 'vitest';
import { can, rolesFor } from './access-matrix';
import type { SafariRole } from '@/lib/api';

const CC_ROLES: SafariRole[] = ['CALL_CENTER', 'CALL_CENTER_SUPERVISOR'];
const DENIED_ROLES: SafariRole[] = [
  'OWNER',
  'GENERAL_MANAGER',
  'MANAGER',
  'DRIVER',
  'ACCOUNTANT',
  'CUSTOMER',
];

function user(role: SafariRole) {
  return { safariRole: role };
}

describe('websiteOrderRequests access matrix guards', () => {
  test('view + act are limited to call-center roles only', () => {
    expect(rolesFor('websiteOrderRequests.view')).toEqual(CC_ROLES);
    expect(rolesFor('websiteOrderRequests.act')).toEqual(CC_ROLES);
  });

  for (const role of CC_ROLES) {
    test(`${role} can view and act on website orders`, () => {
      expect(can(user(role), 'websiteOrderRequests.view')).toBe(true);
      expect(can(user(role), 'websiteOrderRequests.act')).toBe(true);
    });
  }

  for (const role of DENIED_ROLES) {
    test(`${role} cannot view or act on website orders`, () => {
      expect(can(user(role), 'websiteOrderRequests.view')).toBe(false);
      expect(can(user(role), 'websiteOrderRequests.act')).toBe(false);
    });
  }

  test('unauthenticated user is denied', () => {
    expect(can(null, 'websiteOrderRequests.view')).toBe(false);
    expect(can(null, 'websiteOrderRequests.act')).toBe(false);
  });
});
