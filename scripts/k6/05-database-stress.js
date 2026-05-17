import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api';
const USERNAME = __ENV.K6_USERNAME || 'admin';
const PASSWORD = __ENV.K6_PASSWORD || 'admin';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '30s', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '30s', target: 200 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    db_connection_timeouts: ['rate==0'],
    db_stress_errors: ['rate<0.01'],
  },
};

const dbConnectionTimeouts = new Rate('db_connection_timeouts');
const dbStressErrors = new Rate('db_stress_errors');

function jsonHeaders(token) {
  return {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

function parseJson(res) {
  try {
    const body = res.json();
    return body && typeof body === 'object' && 'data' in body ? body.data : body;
  } catch {
    return null;
  }
}

function bodyText(res) {
  return String(res.body || '').toLowerCase();
}

function trackDbErrors(res) {
  const text = bodyText(res);
  const timeout =
    res.status === 503 ||
    text.includes('connection timeout') ||
    text.includes('pool timeout') ||
    text.includes('too many connections') ||
    text.includes('p2024');

  dbConnectionTimeouts.add(timeout);
  dbStressErrors.add(res.status >= 500 || timeout);
}

function login() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ username: USERNAME, password: PASSWORD }),
    jsonHeaders(),
  );
  const payload = parseJson(res);
  return payload?.accessToken || payload?.access_token || payload?.token;
}

export function setup() {
  const token = login();
  if (!token) throw new Error('Could not log in as admin/admin');
  return { token };
}

export default function (data) {
  const params = jsonHeaders(data.token);

  const branches = http.get(`${BASE_URL}/branches`, params);
  trackDbErrors(branches);
  check(branches, {
    'branches query has no db timeout': (r) => r.status === 200,
  });

  const orders = http.get(`${BASE_URL}/orders`, params);
  trackDbErrors(orders);
  check(orders, {
    'orders query has no db timeout': (r) => r.status < 500,
  });

  const collections = http.get(`${BASE_URL}/orders/collections/unpaid-online`, params);
  trackDbErrors(collections);
  check(collections, {
    'collections query has no db timeout or auth crash': (r) =>
      r.status === 200 || r.status === 401 || r.status === 403,
  });

  sleep(0.2);
}

