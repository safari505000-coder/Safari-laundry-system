import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api';
const USERNAME = __ENV.K6_USERNAME || 'admin';
const PASSWORD = __ENV.K6_PASSWORD || 'admin';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    api_baseline_errors: ['rate<0.01'],
  },
};

const apiBaselineErrors = new Rate('api_baseline_errors');

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

function login() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ username: USERNAME, password: PASSWORD }),
    jsonHeaders(),
  );
  const payload = parseJson(res);
  const token = payload?.accessToken || payload?.access_token || payload?.token;
  check(res, {
    'login succeeded': (r) => r.status === 200 && Boolean(token),
  });
  return token;
}

export function setup() {
  const token = login();
  if (!token) {
    throw new Error('Could not log in as admin/admin');
  }
  return { token };
}

export default function (data) {
  const params = jsonHeaders(data.token);

  const branches = http.get(`${BASE_URL}/branches`, params);
  const branchesOk = check(branches, {
    'branches returned 200': (r) => r.status === 200,
  });
  apiBaselineErrors.add(!branchesOk);

  const orders = http.get(`${BASE_URL}/orders`, params);
  const ordersOk = check(orders, {
    'orders endpoint has no server error': (r) => r.status < 500,
  });
  apiBaselineErrors.add(!ordersOk);

  sleep(1);
}

