// Load scenario: orders listing (read). Write load is templated below.
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
  const res = http.get(url('/orders?limit=20'), {
    ...authHeaders(data.token),
    tags: { name: 'orders_list' },
  });
  check(res, { 'orders 2xx': (r) => r.status >= 200 && r.status < 300 });

  // --- WRITE LOAD (STAGING ONLY) — uncomment to exercise order creation ---
  // const create = http.post(
  //   url('/orders'),
  //   JSON.stringify({ customerId: __ENV.CUSTOMER_ID, items: [] }),
  //   { ...authHeaders(data.token), tags: { name: 'orders_create' } },
  // );
  // check(create, { 'order created': (r) => r.status === 201 });

  sleep(1);
}
