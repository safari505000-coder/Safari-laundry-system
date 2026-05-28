import { CustomerPortalAuthService } from './customer-portal-auth.service';

describe('CustomerPortalAuthService security flags', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('disables dev login in production unless explicitly enabled', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CUSTOMER_PORTAL_DEV_LOGIN;

    expect(CustomerPortalAuthService.devLoginEnabled()).toBe(false);
  });

  it('allows dev login in production only when CUSTOMER_PORTAL_DEV_LOGIN=true', () => {
    process.env.NODE_ENV = 'production';
    process.env.CUSTOMER_PORTAL_DEV_LOGIN = 'true';

    expect(CustomerPortalAuthService.devLoginEnabled()).toBe(true);
  });

  it('disables phone preview in production unless explicitly enabled', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.PUBLIC_CUSTOMER_PORTAL_PHONE_PREVIEW;

    expect(CustomerPortalAuthService.phonePreviewEnabled()).toBe(false);
  });

  it('allows phone preview in production only when PUBLIC_CUSTOMER_PORTAL_PHONE_PREVIEW=true', () => {
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_CUSTOMER_PORTAL_PHONE_PREVIEW = 'true';

    expect(CustomerPortalAuthService.phonePreviewEnabled()).toBe(true);
  });
});
