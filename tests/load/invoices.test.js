// Load scenario: invoice reads (issued invoices + finance invoice status).
import { check, sleep } from 'k6';
import http from 'k6/http';
import { login, authHeaders, url, defaultOptions } from './config.js';

export const options = defaultOptions;

export function setup() {
  const token = login();
  if (!token) {
    throw new Error('Login failed in setup — check BASE_URL / credentials.');
  }
  return { token };
}

export default function (data) {
  const issued = http.get(url('/reports/issued-invoices?limit=20'), {
    ...authHeaders(data.token),
    tags: { name: 'invoices_issued' },
  });
  check(issued, { 'issued invoices 2xx': (r) => r.status >= 200 && r.status < 300 });

  const status = http.get(url('/finance/invoices?limit=20'), {
    ...authHeaders(data.token),
    tags: { name: 'invoices_status' },
  });
  check(status, { 'invoice status 2xx/4xx': (r) => r.status < 500 });

  sleep(1);
}
