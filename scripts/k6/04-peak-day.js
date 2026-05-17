import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api';
const USERNAME = __ENV.K6_USERNAME || 'admin';
const PASSWORD = __ENV.K6_PASSWORD || 'admin';
const PAYMENTS_MOCK = String(__ENV.PAYMENTS_MOCK || '').toLowerCase() === 'true';
const RUN_ID = `${Date.now()}`;

export const options = {
  scenarios: {
    drivers_creating_orders: {
      executor: 'constant-vus',
      vus: 45,
      duration: '3m',
      exec: 'driverOrderFlow',
    },
    collections_team_processing: {
      executor: 'constant-vus',
      vus: 35,
      duration: '3m',
      exec: 'collectionsFlow',
    },
    call_center_marking_debts: {
      executor: 'constant-vus',
      vus: 20,
      duration: '3m',
      exec: 'callCenterDebtFlow',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    peak_day_server_errors: ['rate<0.01'],
  },
};

const peakDayServerErrors = new Rate('peak_day_server_errors');

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
  peakDayServerErrors.add(res.status >= 500);
  return res;
}

function login(username, password) {
  const res = postJson('/auth/login', { username, password }, null);
  const payload = parseJson(res);
  return payload?.accessToken || payload?.access_token || payload?.token;
}

function firstOperationalBranch(ownerToken) {
  const res = http.get(`${BASE_URL}/branches`, jsonHeaders(ownerToken));
  peakDayServerErrors.add(res.status >= 500);
  const branches = parseJson(res);
  if (Array.isArray(branches)) {
    const existing = branches.find((branch) => branch.isAdministrative !== true);
    if (existing?.id) return existing;
  }

  const create = postJson(
    '/branches',
    {
      name: `K6 Peak Branch ${RUN_ID}`,
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
  postJson(
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
  return login(username, password);
}

function createDebtOrder(driverToken, vu, iter, amount = 15) {
  const seed = `${RUN_ID}${vu}${iter}`.slice(-8);
  const res = postJson(
    '/pos/checkout',
    {
      customerPhone: `5${seed.slice(-7)}`,
      customerDisplayName: `K6 Salary Day ${RUN_ID}-${vu}-${iter}`,
      customerAddress: `K6 Peak Day Address ${RUN_ID}`,
      totalPrice: amount,
      serviceType: 'NORMAL',
      posPaymentMethod: 'DEBT_ON_ACCOUNT',
      notes: `k6 first-of-month salary day ${RUN_ID}`,
    },
    driverToken,
  );
  const order = parseJson(res);
  return { res, order, customerId: order?.customer?.id || order?.customerId };
}

export function setup() {
  const ownerToken = login(USERNAME, PASSWORD);
  if (!ownerToken) throw new Error('Could not log in as admin/admin');

  const branch = firstOperationalBranch(ownerToken);
  if (!branch?.id) throw new Error('Could not resolve operational branch');

  const driverToken = createStaffUser('DRIVER', branch.id, ownerToken);
  const callCenterToken = createStaffUser('CALL_CENTER', branch.id, ownerToken);
  if (!driverToken || !callCenterToken) throw new Error('Could not create/login peak-day users');

  return { ownerToken, driverToken, callCenterToken };
}

export function driverOrderFlow(data) {
  const { res } = createDebtOrder(data.driverToken, __VU, __ITER, 12);
  check(res, {
    'driver order created during peak day': (r) => r.status === 200 || r.status === 201,
  });
  sleep(0.25);
}

export function collectionsFlow(data) {
  const list = http.get(`${BASE_URL}/orders/collections/unpaid-online`, jsonHeaders(data.callCenterToken));
  peakDayServerErrors.add(list.status >= 500);
  const rows = parseJson(list);
  check(list, {
    'collections list available': (r) => r.status === 200,
  });

  const first = Array.isArray(rows) ? rows[0] : rows?.rows?.[0];
  const orderId = first?.orderId || first?.id;
  if (orderId && __ITER % 3 === 0 && !PAYMENTS_MOCK) {
    const link = postJson(`/call-center/orders/${orderId}/payment-link`, {}, data.callCenterToken);
    check(link, {
      'collections payment link action has no server error': (r) => r.status < 500,
    });
  }
  sleep(0.5);
}

export function callCenterDebtFlow(data) {
  const created = createDebtOrder(data.driverToken, __VU, __ITER, 9);
  check(created.res, {
    'call center debt fixture order created': (r) => r.status === 200 || r.status === 201,
  });

  if (created.customerId) {
    const payment = postJson(
      `/call-center/customers/${created.customerId}/partial-debt-payment`,
      {
        amountKd: '3.0000',
        paymentMethod: 'CASH',
        note: `k6 salary day collection ${RUN_ID}`,
      },
      data.callCenterToken,
    );
    check(payment, {
      'call center partial debt payment accepted': (r) => r.status === 200 || r.status === 201,
    });
  }

  sleep(0.5);
}

