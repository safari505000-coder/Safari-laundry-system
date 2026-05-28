import {
  isPublicCompanyWebsiteHost,
  isStaffErpWebsiteHost,
  staffErpLoginRedirectUrl,
} from './website-host-routing';

describe('website host routing', () => {
  it('treats www as staff ERP host', () => {
    expect(isStaffErpWebsiteHost('www.safariomni.com')).toBe(true);
    expect(isPublicCompanyWebsiteHost('www.safariomni.com')).toBe(false);
  });

  it('treats apex as public company host', () => {
    expect(isPublicCompanyWebsiteHost('safariomni.com')).toBe(true);
    expect(isStaffErpWebsiteHost('safariomni.com')).toBe(false);
  });

  it('builds staff login redirect from PUBLIC_WEB_APP_URL', () => {
    process.env.PUBLIC_WEB_APP_URL = 'https://www.safariomni.com/';
    expect(staffErpLoginRedirectUrl()).toBe('https://www.safariomni.com/login');
    delete process.env.PUBLIC_WEB_APP_URL;
  });
});
