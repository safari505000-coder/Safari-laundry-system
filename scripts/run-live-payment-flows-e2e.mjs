import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000/api';
const REPORT_PATH =
  process.env.E2E_REPORT_PATH ??
  'C:/Users/safar/Desktop/e2e-test-results.md';

const state = {
  tokens: {},
  rows: [],
  details: [],
};

function stamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

const runId = stamp();

function kd(value) {
  const n = Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

function pass(name, detail = '') {
  state.rows.push({ ok: true, name, detail });
  console.log(`PASS ${name}${detail ? ` - ${detail}` : ''}`);
}

function fail(name, detail = '') {
  state.rows.push({ ok: false, name, detail });
  console.log(`FAIL ${name}${detail ? ` - ${detail}` : ''}`);
}

async function step(name, fn) {
  try {
    const detail = await fn();
    pass(name, detail);
    return { ok: true, value: detail };
  } catch (error) {
    fail(name, error instanceof Error ? error.message : String(error));
    return { ok: false, error };
  }
}

async function request(method, url, body, opts = {}) {
  const token = opts.token ?? state.tokens.owner ?? null;
  const headers = {
    Accept: 'application/json',
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers ?? {}),
  };
  const res = await fetch(`${BASE_URL}${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const message =
      typeof data === 'object' && data !== null
        ? JSON.stringify(data)
        : String(data ?? '');
    throw new Error(`${method} ${url} -> ${res.status}: ${message}`);
  }
  if (
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    'meta' in data &&
    'data' in data
  ) {
    return data.data;
  }
  return data;
}

async function loginAs(username, password) {
  const login = await request(
    'POST',
    '/auth/login',
    { username, password },
    { token: null },
  );
  const payload = login?.data ?? login;
  if (payload.requiresPasswordChange) {
    throw new Error(`Login for ${username} requires password change`);
  }
  const token =
    payload.accessToken ??
    payload.access_token ??
    payload.token ??
    payload.jwtToken;
  if (!token) throw new Error(`No access token in login response for ${username}`);
  return { token, user: payload.user };
}

async function getLedger(customerId) {
  return request('GET', `/call-center/customers/${customerId}/ledger?limit=50`, undefined, {
    token: state.tokens.callCenter,
  });
}

function headerDebt(ledger) {
  return kd(ledger?.customer?.walletDebtKd ?? ledger?.header?.walletDebtKd);
}

function headerBalance(ledger) {
  return kd(ledger?.customer?.walletBalanceKd ?? ledger?.header?.walletBalanceKd);
}

async function collectionsRows() {
  const data = await request('GET', '/orders/collections/unpaid-online', undefined, {
    token: state.tokens.callCenter,
  });
  return Array.isArray(data) ? data : data?.rows ?? [];
}

async function findCollectionOrder(orderId) {
  const rows = await collectionsRows();
  return rows.find((row) => row.orderId === orderId || row.id === orderId) ?? null;
}

async function createOrder({ phone, customerId, amount, method, usePos = true }) {
  const payload = {
    customerPhone: phone,
    ...(customerId ? { customerId } : {}),
    customerDisplayName: `E2E ${method} ${runId}`,
    customerAddress: `E2E Address ${runId}`,
    totalPrice: amount,
    serviceType: 'NORMAL',
    posPaymentMethod: method,
    notes: `live e2e ${runId}`,
  };
  const url = usePos ? '/pos/checkout' : '/orders/quick';
  return request('POST', url, payload, { token: state.tokens.driver });
}

async function createPlan20() {
  return request('POST', '/subscription-plans', {
    name: `E2E 20KD ${runId}`,
    salePrice: 20,
    actualBalance: 20,
    validityDays: 30,
    isActive: true,
  });
}

async function activateSubscription(customerId, planId) {
  return request('POST', '/call-center/subscriptions/activate', {
    customerId,
    planId,
    paymentMethod: 'CASH',
    companySupportAmountKd: '0.0000',
  }, { token: state.tokens.callCenter });
}

async function firstOperationalBranch() {
  const branches = await request('GET', '/branches');
  const existing = branches.find((branch) => branch.isAdministrative !== true);
  if (existing) return existing;
  return request('POST', '/branches', {
    name: `E2E Branch ${runId}`,
    location: `E2E Location ${runId}`,
    isActive: true,
    isAdministrative: false,
  });
}

async function createStaffUser(role, branchId) {
  const username = `e2e_${role.toLowerCase()}_${runId}`;
  const password = `E2E-${role}-${runId}!`;
  const user = await request('POST', '/users', {
    fullName: `E2E ${role} ${runId}`,
    username,
    password,
    safariRole: role,
    branchId,
    isActive: true,
  });
  const login = await loginAs(username, password);
  return { username, password, user, token: login.token };
}

function requireId(value, label) {
  if (!value) throw new Error(`${label} missing because a previous step failed`);
  return value;
}

async function main() {
  state.details.push(`Base URL: ${BASE_URL}`);
  state.details.push(`Run ID: ${runId}`);

  const ownerLogin = await step('SCENARIO 1.1 Login as OWNER admin/admin', async () => {
    const login = await loginAs('admin', 'admin');
    state.tokens.owner = login.token;
    return `user=${login.user?.username ?? 'admin'}`;
  });

  await step('SETUP Create/login DRIVER and CALL_CENTER test users', async () => {
    if (!ownerLogin.ok) {
      throw new Error('Skipped because OWNER login failed');
    }
    const branch = await firstOperationalBranch();
    const driver = await createStaffUser('DRIVER', branch.id);
    const callCenter = await createStaffUser('CALL_CENTER', branch.id);
    state.tokens.driver = driver.token;
    state.tokens.callCenter = callCenter.token;
    return `branch=${branch.id} driver=${driver.username} callCenter=${callCenter.username}`;
  });

  const s1 = {};
  await step('SCENARIO 1.2 Create PAYMENT_LINK order amount 10 KD', async () => {
    const order = await createOrder({
      phone: `55${runId.slice(-6)}`,
      amount: 10,
      method: 'PAYMENT_LINK',
      usePos: true,
    });
    s1.order = order;
    s1.orderId = order.id;
    s1.customerId = order.customer?.id ?? order.customerId;
    if (!s1.orderId || !s1.customerId) {
      throw new Error(`Missing order/customer id: ${JSON.stringify(order)}`);
    }
    return `order=${s1.orderId} customer=${s1.customerId}`;
  });

  await step('SCENARIO 1.3 CustomerWallet.debt increased by 10 KD', async () => {
    const ledger = await getLedger(requireId(s1.customerId, 'scenario 1 customerId'));
    const debt = headerDebt(ledger);
    if (Math.abs(debt - 10) > 0.001) {
      throw new Error(`expected debt 10.000, got ${debt.toFixed(4)}`);
    }
    return `walletDebt=${debt.toFixed(4)}`;
  });

  await step('SCENARIO 1.4 PAYMENT_LINK order appears in collections', async () => {
    const row = await findCollectionOrder(requireId(s1.orderId, 'scenario 1 orderId'));
    if (!row) throw new Error('order not found in collections');
    return `amount=${row.amountKd ?? row.totalPrice ?? 'n/a'}`;
  });

  await step('SCENARIO 1.5 Payment link was created', async () => {
    const row = await findCollectionOrder(requireId(s1.orderId, 'scenario 1 orderId'));
    const url =
      s1.order?.posHostedPaymentUrl ??
      s1.order?.paymentLink?.url ??
      row?.paymentUrl ??
      row?.posHostedPaymentUrl;
    if (!url) throw new Error('posHostedPaymentUrl/paymentUrl is null');
    return String(url);
  });

  const s2 = {};
  await step('SCENARIO 2.1 Create DEBT_ON_ACCOUNT order amount 15 KD', async () => {
    const order = await createOrder({
      phone: `56${runId.slice(-6)}`,
      amount: 15,
      method: 'DEBT_ON_ACCOUNT',
      usePos: true,
    });
    s2.order = order;
    s2.orderId = order.id;
    s2.customerId = order.customer?.id ?? order.customerId;
    if (!s2.orderId || !s2.customerId) {
      throw new Error(`Missing order/customer id: ${JSON.stringify(order)}`);
    }
    return `order=${s2.orderId} customer=${s2.customerId}`;
  });

  await step('SCENARIO 2.2 CustomerWallet.debt increased by 15 KD', async () => {
    const ledger = await getLedger(requireId(s2.customerId, 'scenario 2 customerId'));
    const debt = headerDebt(ledger);
    if (Math.abs(debt - 15) > 0.001) {
      throw new Error(`expected debt 15.000, got ${debt.toFixed(4)}`);
    }
    return `walletDebt=${debt.toFixed(4)}`;
  });

  await step('SCENARIO 2.3 DEBT_ON_ACCOUNT order appears in collections', async () => {
    const row = await findCollectionOrder(requireId(s2.orderId, 'scenario 2 orderId'));
    if (!row) throw new Error('order not found in collections');
    return `amount=${row.amountKd ?? row.totalPrice ?? 'n/a'}`;
  });

  await step('SCENARIO 2.4 Call center marks partial payment of 5 KD', async () => {
    const result = await request(
      'POST',
      `/call-center/customers/${requireId(s2.customerId, 'scenario 2 customerId')}/partial-debt-payment`,
      {
        amountKd: '5.0000',
        paymentMethod: 'CASH',
        note: `live e2e ${runId}`,
      },
      { token: state.tokens.callCenter },
    );
    return `transaction=${result.transactionHistoryId ?? result.id ?? 'ok'}`;
  });

  await step('SCENARIO 2.5 Debt reduced to 10 KD', async () => {
    const ledger = await getLedger(requireId(s2.customerId, 'scenario 2 customerId'));
    const debt = headerDebt(ledger);
    if (Math.abs(debt - 10) > 0.001) {
      throw new Error(`expected debt 10.000, got ${debt.toFixed(4)}`);
    }
    return `walletDebt=${debt.toFixed(4)}`;
  });

  const s3 = {};
  await step('SCENARIO 3.1 Customer with 20 KD subscription balance', async () => {
    const baseCustomer = await request('POST', '/pos/customers', {
      phone: `57${runId.slice(-6)}`,
      displayName: `E2E SUBSCRIPTION ${runId}`,
      addressArea: 'E2E',
      addressBlock: '1',
      addressStreet: 'Test Street',
      addressHouse: '1',
    }, { token: state.tokens.driver });
    s3.customerId = baseCustomer.id;
    if (!s3.customerId) throw new Error('Could not create/find customer');
    const plan = await createPlan20();
    s3.planId = plan.id;
    await activateSubscription(s3.customerId, s3.planId);
    const ledger = await getLedger(s3.customerId);
    const balance = headerBalance(ledger);
    if (Math.abs(balance - 20) > 0.001) {
      throw new Error(`expected balance 20.000, got ${balance.toFixed(4)}`);
    }
    return `customer=${s3.customerId} balance=${balance.toFixed(4)}`;
  });

  await step('SCENARIO 3.2 Create order for 25 KD using subscription wallet', async () => {
    const order = await createOrder({
      phone: `57${runId.slice(-6)}`,
      customerId: requireId(s3.customerId, 'scenario 3 customerId'),
      amount: 25,
      method: 'SUBSCRIPTION_WALLET',
      usePos: true,
    });
    s3.order = order;
    s3.orderId = order.id;
    if (!s3.orderId) throw new Error(`Missing order id: ${JSON.stringify(order)}`);
    return `order=${s3.orderId}`;
  });

  await step('SCENARIO 3.3 20 KD deducted from subscription', async () => {
    const ledger = await getLedger(requireId(s3.customerId, 'scenario 3 customerId'));
    const balance = headerBalance(ledger);
    if (Math.abs(balance - 0) > 0.001) {
      throw new Error(`expected balance 0.000, got ${balance.toFixed(4)}`);
    }
    return `walletBalance=${balance.toFixed(4)}`;
  });

  await step('SCENARIO 3.4 5 KD registered as debt', async () => {
    const ledger = await getLedger(requireId(s3.customerId, 'scenario 3 customerId'));
    const debt = headerDebt(ledger);
    if (Math.abs(debt - 5) > 0.001) {
      throw new Error(`expected debt 5.000, got ${debt.toFixed(4)}`);
    }
    return `walletDebt=${debt.toFixed(4)}`;
  });

  await step('SCENARIO 3.5 Subscription shortfall appears in collections', async () => {
    const row = await findCollectionOrder(requireId(s3.orderId, 'scenario 3 orderId'));
    if (!row) throw new Error('order not found in collections');
    return `amount=${row.amountKd ?? row.totalPrice ?? 'n/a'}`;
  });

  const passed = state.rows.filter((row) => row.ok).length;
  const failed = state.rows.length - passed;
  const md = [
    '# Live E2E Payment Flow Results',
    '',
    `- Generated: ${new Date().toISOString()}`,
    `- Base URL: ${BASE_URL}`,
    `- Run ID: ${runId}`,
    `- Summary: ${passed} PASS / ${failed} FAIL`,
    '',
    '| Step | Result | Detail |',
    '| --- | --- | --- |',
    ...state.rows.map(
      (row) =>
        `| ${row.name.replaceAll('|', '\\|')} | ${row.ok ? 'PASS' : 'FAIL'} | ${String(
          row.detail,
        ).replaceAll('|', '\\|')} |`,
    ),
    '',
  ].join('\n');
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, md, 'utf8');
  console.log(`\nSaved report: ${REPORT_PATH}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  fail('SCRIPT_FATAL', error instanceof Error ? error.stack ?? error.message : String(error));
  await fs.writeFile(
    REPORT_PATH,
    `# Live E2E Payment Flow Results\n\nFATAL:\n\n\`\`\`\n${state.rows
      .map((row) => `${row.ok ? 'PASS' : 'FAIL'} ${row.name}: ${row.detail}`)
      .join('\n')}\n\`\`\`\n`,
    'utf8',
  );
  process.exitCode = 1;
});
