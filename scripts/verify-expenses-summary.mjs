/* eslint-disable no-console */
/**
 * STRICT ROLE-BASED EXPENSE DESIGN — smoke test.
 *
 * Verifies:
 *   1. GET /api/finance/expenses-summary returns the SSoT shape for
 *      OWNER (admin user).
 *   2. The response contains canonical keys (`source`, totals,
 *      `byOwnerType`, `byCategory`, `byBranch`, `monthly`, `alerts`).
 *   3. byOwnerType always includes BRANCH / DRIVER / COMPANY rows.
 *
 * Usage:
 *   node scripts/verify-expenses-summary.mjs
 */

const BASE = process.env.SAFARI_BASE ?? 'http://localhost:3000';
const ADMIN_USER = process.env.SAFARI_ADMIN_USER ?? 'admin';
const ADMIN_PASS = process.env.SAFARI_ADMIN_PASS ?? 'admin';

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`login failed: ${res.status} ${body}`);
  }
  const body = await res.json();
  return body.data?.accessToken ?? body.accessToken ?? body.token;
}

async function main() {
  const token = await login(ADMIN_USER, ADMIN_PASS);

  const from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date().toISOString();

  const url = `${BASE}/api/finance/expenses-summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`/expenses-summary failed: ${res.status} ${body}`);
  }
  const envelope = await res.json();
  const data = envelope.data ?? envelope;

  const required = [
    'source',
    'rangeFromIso',
    'rangeToIso',
    'totalApprovedKd',
    'totalPendingKd',
    'approvedCount',
    'byOwnerType',
    'byCategory',
    'byBranch',
    'monthly',
    'alerts',
  ];
  const missing = required.filter((k) => !(k in data));
  if (missing.length) {
    throw new Error(`response missing keys: ${missing.join(', ')}`);
  }
  if (data.source !== 'api/finance/expenses-summary') {
    throw new Error(`unexpected source marker: ${data.source}`);
  }

  const ownerKeys = data.byOwnerType.map((row) => row.ownerType).sort();
  const expectedOwners = ['BRANCH', 'COMPANY', 'DRIVER'];
  const ownersOk =
    expectedOwners.every((k) => ownerKeys.includes(k)) &&
    ownerKeys.length === 3;
  if (!ownersOk) {
    throw new Error(
      `byOwnerType must have BRANCH/DRIVER/COMPANY exactly; got ${ownerKeys.join(',')}`,
    );
  }

  console.log('OK /api/finance/expenses-summary');
  console.log(`  totalApprovedKd = ${data.totalApprovedKd}`);
  console.log(`  totalPendingKd  = ${data.totalPendingKd}`);
  console.log(`  approvedCount   = ${data.approvedCount}`);
  console.log(
    `  byOwnerType     = ${data.byOwnerType
      .map((r) => `${r.ownerType}=${r.totalKd}(${r.count})`)
      .join(', ')}`,
  );
  console.log(`  byCategory      = ${data.byCategory.length} rows`);
  console.log(`  byBranch        = ${data.byBranch.length} rows`);
  console.log(`  monthly         = ${data.monthly.length} months`);
  console.log(`  alerts          = ${data.alerts.length} alert(s)`);
  if (data.alerts.length) {
    for (const alert of data.alerts) {
      console.log(`    - [${alert.severity}] ${alert.message}`);
    }
  }
}

/**
 * STRICT ROLE-BASED EXPENSE DESIGN — Part 7 (role check).
 *
 * Verifies that a non-financial role (here we attempt with a manager
 * username if provided in env) is rejected with 403. Skipped silently
 * if no manager credentials are supplied — an unattended dev DB may
 * not seed a known manager.
 */
async function checkManagerForbidden() {
  const mgrUser = process.env.SAFARI_MGR_USER;
  const mgrPass = process.env.SAFARI_MGR_PASS;
  if (!mgrUser || !mgrPass) {
    console.log('SKIP manager-forbidden check (set SAFARI_MGR_USER/PASS)');
    return;
  }
  let token;
  try {
    token = await login(mgrUser, mgrPass);
  } catch (err) {
    console.log(
      `SKIP manager-forbidden check (login failed: ${err.message ?? err})`,
    );
    return;
  }
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date().toISOString();
  const res = await fetch(
    `${BASE}/api/finance/expenses-summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (res.status !== 403 && res.status !== 401) {
    const body = await res.text();
    throw new Error(
      `manager must be denied; got ${res.status} ${body.slice(0, 120)}`,
    );
  }
  console.log(`OK manager-forbidden (status=${res.status})`);
}

main()
  .then(() => checkManagerForbidden())
  .catch((err) => {
    console.error('FAIL:', err.message ?? err);
    process.exitCode = 1;
  });
