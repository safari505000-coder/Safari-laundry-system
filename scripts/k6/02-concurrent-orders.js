import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api';
const USERNAME = __ENV.K6_USERNAME || 'admin';
const PASSWORD = __ENV.K6_PASSWORD || 'admin';
const RUN_ID = `${Date.now()}`;

export const options = {
  vus: 50,
  duration: '1m',
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    server_500_errors: ['rate==0'],
  },
};

const server500Errors = new Rate('server_500_errors');

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

function postJson(path, body, token) {
  const res = http.post(`${BASE_URL}${path}`, JSON.stringify(body), jsonHeaders(token));
  server500Errors.add(res.status >= 500);
  return res;
}

function login(username, password) {
  const res = postJson('/auth/login', { username, password }, null);
  const payload = parseJson(res);
  return payload?.accessToken || payload?.access_token || payload?.token;
}

function firstOperationalBranch(ownerToken) {
  const res = http.get(`${BASE_URL}/branches`, jsonHeaders(ownerToken));
  const branches = parseJson(res);
  if (Array.isArray(branches)) {
    const existing = branches.find((branch) => branch.isAdministrative !== true);
    if (existing?.id) return existing;
  }

  const create = postJson(
    '/branches',
    {
      name: `K6 Orders Branch ${RUN_ID}`,
      location: `K6 ${RUN_ID}`,
      isActive: true,
      isAdministrative: false,
    },
    ownerToken,
  );
  return parseJson(create);
}

function createStaffUser(role, branchId, ownerToken) {
  const username = `k6_${role.toLowerCase()}_${RUN_ID}`;
  const password = `K6-${role}-${RUN_ID}!`;
  const res = postJson(
    '/users',
    {
      fullName: `K6 ${role} ${RUN_ID}`,
      username,
      password,
      safariRole: role,
      branchId,
      isActive: true,
    },
    ownerToken,
  );

  check(res, { [`created ${role}`]: (r) => r.status === 200 || r.status === 201 || r.status === 409 });
  return login(username, password);
}

export function setup() {
  const ownerToken = login(USERNAME, PASSWORD);
  if (!ownerToken) throw new Error('Could not log in as admin/admin');

  const branch = firstOperationalBranch(ownerToken);
  if (!branch?.id) throw new Error('Could not resolve operational branch');

  const driverToken = createStaffUser('DRIVER', branch.id, ownerToken);
  if (!driverToken) throw new Error('Could not create/login DRIVER user');

  return { driverToken };
}

export default function (data) {
  const n = `${RUN_ID}${__VU}${__ITER}`.slice(-8);
  const res = postJson(
    '/pos/checkout',
    {
      customerPhone: `5${n.slice(-7)}`,
      customerDisplayName: `K6 Payment Link ${RUN_ID}-${__VU}-${__ITER}`,
      customerAddress: `K6 Address ${RUN_ID}`,
      totalPrice: 10,
      serviceType: 'NORMAL',
      posPaymentMethod: 'PAYMENT_LINK',
      notes: `k6 concurrent orders ${RUN_ID}`,
    },
    data.driverToken,
  );

  check(res, {
    'order created without 500': (r) => r.status < 500,
    'order create accepted': (r) => r.status === 200 || r.status === 201,
  });

  sleep(0.2);
}

