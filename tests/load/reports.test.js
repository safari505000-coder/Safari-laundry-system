// Load scenario: heavy aggregation report endpoints.
import { check, sleep } from 'k6';
import http from 'k6/http';
import { login, authHeaders, url, baseThresholds } from './config.js';

export const options = {
  vus: Number(__ENV.VUS || 5),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    ...baseThresholds,
    // Reports aggregate data — allow a more generous p95.
    'http_req_duration{name:report_exec_summary}': ['p(95)<3000'],
  },
};

export function setup() {
  const token = login();
  if (!token) {
    throw new Error('Login failed in setup — check BASE_URL / credentials.');
  }
  return { token };
}

export default function (data) {
  const summary = http.get(url('/reports/executive-summary'), {
    ...authHeaders(data.token),
    tags: { name: 'report_exec_summary' },
  });
  check(summary, { 'exec summary <500': (r) => r.status < 500 });

  const monthly = http.get(url('/reports/monthly-summary'), {
    ...authHeaders(data.token),
    tags: { name: 'report_monthly' },
  });
  check(monthly, { 'monthly <500': (r) => r.status < 500 });

  sleep(1);
}
