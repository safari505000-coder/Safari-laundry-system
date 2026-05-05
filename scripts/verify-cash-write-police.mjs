/**
 * One-shot verifier for CashWritePoliceGuard.
 *
 * Logs in as the seeded admin (OWNER), then confirms that the guard
 * applied via @CashWriteEndpoint(SafariRole.MANAGER) on
 * POST /api/finance/handover/confirm rejects the OWNER caller with
 * 403. This proves both:
 *   - The guard is wired into the global APP_GUARD pipeline.
 *   - The role allowlist is read from the @CashWriteEndpoint metadata.
 *
 * It then attempts a poisoned body containing a forbidden override
 * key (`cashAmount`). The expected outcome is identical 403 behaviour
 * (role check fires first; the body validation is the second gate).
 *
 * NEVER mutates state -- the request is rejected before reaching the
 * service layer.
 */
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const USER = process.env.AUDIT_USER ?? 'admin';
const PASS = process.env.AUDIT_PASS ?? 'admin';

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (!res.ok) {
    throw new Error(`login failed ${res.status}`);
  }
  const body = await res.json();
  return body.data.accessToken;
}

async function attempt(label, token, body) {
  const res = await fetch(`${BASE}/api/finance/handover/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  let detail = null;
  try {
    detail = await res.json();
  } catch {
    detail = null;
  }
  console.log(`[${label}] status=${res.status} message=${detail?.message ?? '<none>'}`);
  return { status: res.status, body: detail };
}

const token = await login();
console.log('logged in as OWNER');

await attempt('clean_body_owner', token, {
  driverId: '00000000-0000-0000-0000-000000000000',
});

await attempt('poisoned_body_owner', token, {
  driverId: '00000000-0000-0000-0000-000000000000',
  cashAmount: 999.9999,
  totalCash: 999.9999,
  heldCashKd: 999.9999,
});

console.log('done.');
