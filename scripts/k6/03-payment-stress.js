import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api';
const USERNAME = __ENV.K6_USERNAME || 'admin';
const PASSWORD = __ENV.K6_PASSWORD || 'admin';
const RUN_ID = `${Date.now()}`;

export const options = {
  vus: 30,
  duration: '2m',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    negative_debt_seen: ['rate==0'],
    duplicate_journal_seen: ['rate==0'],
  },
};

const negativeDebtSeen = new Rate('negative_debt_seen');
const duplicateJournalSeen = new Rate('duplicate_journal_seen');

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
  return http.post(`${BASE_URL}${path}`, JSON.stringify(body), jsonHeaders(token));
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
      name: `K6 Payments Branch ${RUN_ID}`,
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

function walletDebtFromLedger(ledger) {
  const raw = ledger?.customer?.walletDebtKd ?? ledger?.header?.walletDebtKd ?? '0';
  const value = Number.parseFloat(String(raw));
  return Number.isFinite(value) ? value : 0;
}

function hasDuplicateJournalEntry(entries) {
  const rows = Array.isArray(entries) ? entries : entries?.entries || entries?.rows || [];
  const seen = new Set();
  for (const row of rows) {
    const key = row.id || row.entryId || row.journalEntryId || row.reference || JSON.stringify(row);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export function setup() {
  const ownerToken = login(USERNAME, PASSWORD);
  if (!ownerToken) throw new Error('Could not log in as admin/admin');

  const branch = firstOperationalBranch(ownerToken);
  if (!branch?.id) throw new Error('Could not resolve operational branch');

  const driverToken = createStaffUser('DRIVER', branch.id, ownerToken);
  const callCenterToken = createStaffUser('CALL_CENTER', branch.id, ownerToken);
  if (!driverToken || !callCenterToken) throw new Error('Could not create/login stress users');

  return { driverToken, callCenterToken };
}

export default function (data) {
  const seed = `${RUN_ID}${__VU}${__ITER}`.slice(-8);
  const method = __ITER % 2 === 0 ? 'PAYMENT_LINK' : 'DEBT_ON_ACCOUNT';
  const amount = method === 'PAYMENT_LINK' ? 10 : 15;

  const orderRes = postJson(
    '/pos/checkout',
    {
      customerPhone: `5${seed.slice(-7)}`,
      customerDisplayName: `K6 Payment Stress ${RUN_ID}-${__VU}-${__ITER}`,
      customerAddress: `K6 Address ${RUN_ID}`,
      totalPrice: amount,
      serviceType: 'NORMAL',
      posPaymentMethod: method,
      notes: `k6 payment stress ${RUN_ID}`,
    },
    data.driverToken,
  );
  const order = parseJson(orderRes);
  const customerId = order?.customer?.id || order?.customerId;

  check(orderRes, {
    'stress order created': (r) => r.status === 200 || r.status === 201,
  });

  if (customerId && method === 'DEBT_ON_ACCOUNT') {
    const partialRes = postJson(
      `/call-center/customers/${customerId}/partial-debt-payment`,
      {
        amountKd: '5.0000',
        paymentMethod: 'CASH',
        note: `k6 partial payment ${RUN_ID}`,
      },
      data.callCenterToken,
    );
    check(partialRes, {
      'partial payment accepted': (r) => r.status === 200 || r.status === 201,
    });
  }

  if (customerId) {
    const ledgerRes = http.get(
      `${BASE_URL}/call-center/customers/${customerId}/ledger?limit=50`,
      jsonHeaders(data.callCenterToken),
    );
    const ledger = parseJson(ledgerRes);
    const debt = walletDebtFromLedger(ledger);
    negativeDebtSeen.add(debt < -0.001);
    check(ledgerRes, {
      'debt never goes negative': () => debt >= -0.001,
    });

    const journalRes = http.get(
      `${BASE_URL}/finance/journal/customers/${customerId}/full-entries`,
      jsonHeaders(data.callCenterToken),
    );
    const journal = parseJson(journalRes);
    const duplicate = hasDuplicateJournalEntry(journal);
    duplicateJournalSeen.add(duplicate);
    check(journalRes, {
      'no duplicate journal entries': () => !duplicate,
    });
  }

  sleep(0.5);
}

