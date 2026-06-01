// Load scenario: payments listing (read). Write load is templated below and
// must ONLY be run against a disposable staging database.
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
  const res = http.get(url('/payments?limit=20'), {
    ...authHeaders(data.token),
    tags: { name: 'payments_list' },
  });
  check(res, { 'payments <500': (r) => r.status < 500 });

  // --- WRITE LOAD (STAGING ONLY) — uncomment to exercise payment capture ---
  // const pay = http.post(
  //   url('/payments'),
  //   JSON.stringify({ orderId: __ENV.ORDER_ID, amount: 1, method: 'CASH' }),
  //   { ...authHeaders(data.token), tags: { name: 'payments_create' } },
  // );
  // check(pay, { 'payment accepted': (r) => r.status === 201 });

  sleep(1);
}
