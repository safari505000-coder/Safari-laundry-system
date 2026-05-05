// One-shot verifier for the manager-actor CASH POS projection fix.
// Mints a short-lived MANAGER JWT for user 514 and asserts that
// /api/manager/cash-status now returns 3.7500 (was 0.5000 before fix).
import jwt from 'jsonwebtoken';
import fs from 'node:fs';

// Match AuthModule fallback used by the dev server (no JWT_SECRET in .env).
const secret =
  process.env.JWT_SECRET ?? 'safari-dev-jwt-secret-change-in-production';

const userId = '45a5b9bb-d7c3-4428-9a9c-c61928803a74';
const branchId = '7c1c3a15-ca1f-429b-8bfa-24e85e990ef2';

const token = jwt.sign(
  {
    sub: userId,
    username: '514',
    safariRole: 'MANAGER',
    role: 'MANAGER',
    branchId,
  },
  secret,
  { expiresIn: '5m' },
);

const r = await fetch('http://127.0.0.1:3000/api/manager/cash-status', {
  headers: { Authorization: `Bearer ${token}` },
});
console.log('status=', r.status);
const body = await r.json();
console.log(JSON.stringify(body, null, 2));

const v = body?.data?.pendingDepositKd ?? body?.pendingDepositKd;
if (v !== '3.7500') {
  console.error(`FAIL: expected pendingDepositKd=3.7500, got ${v}`);
  process.exit(1);
}
console.log('OK: pendingDepositKd=3.7500 (custody 0.5000 + own POS 3.2500)');
