/** Hostname (no port) for the public company marketing site (apex). */
export function isPublicCompanyWebsiteHost(hostname: string): boolean {
  const h = hostname.toLowerCase().split(':')[0];
  if (isStaffErpWebsiteHost(hostname)) {
    return false;
  }
  if (h === 'localhost' || h === '127.0.0.1') {
    return true;
  }
  const configured = (process.env.PUBLIC_COMPANY_WEB_HOSTS ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length > 0) {
    return configured.includes(h);
  }
  return h === 'safariomni.com';
}

/** Hostname for the staff ERP SPA (www subdomain). */
export function isStaffErpWebsiteHost(hostname: string): boolean {
  const h = hostname.toLowerCase().split(':')[0];
  return h.startsWith('www.');
}

export function staffErpLoginRedirectUrl(): string {
  const base =
    process.env.PUBLIC_WEB_APP_URL?.trim().replace(/\/+$/, '') ||
    'https://www.safariomni.com';
  return `${base}/login`;
}
