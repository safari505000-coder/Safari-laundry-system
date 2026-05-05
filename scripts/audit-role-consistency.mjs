/**
 * One-shot role-consistency auditor.
 *
 * Compares User.safariRole (enum) vs User.role.name (relational Role
 * row) for every active user. A drift means a user is misclassified
 * and may appear in one screen while being invisible to another (the
 * "branch manager appearing as driver" class of bug, except real:
 * caused by a seed/migration that updated one column without the
 * other).
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:3000 \
 *   AUDIT_USER=admin AUDIT_PASS=admin \
 *   node scripts/audit-role-consistency.mjs
 *
 * Exits 0 when PASS, 1 when FAIL, 2 on transport/auth error. NEVER
 * mutates state — the endpoint itself is read-only.
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
  const token = body.data?.accessToken ?? body.accessToken ?? body.token;
  if (!token) throw new Error('login response missing accessToken');
  return token;
}

async function audit(token) {
  const res = await fetch(
    `${BASE}/api/cash-intelligence/role-consistency-audit`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`audit failed ${res.status} ${body}`);
  }
  const envelope = await res.json();
  return envelope.data ?? envelope;
}

try {
  const token = await login();
  console.log(`logged in as ${USER}`);
  const report = await audit(token);

  console.log('');
  console.log('─── Role Consistency Audit ───');
  console.log(`  status                : ${report.status}`);
  console.log(`  totalActiveUsers      : ${report.totalActiveUsers}`);
  console.log(`  mismatchCount         : ${report.mismatches.length}`);
  console.log(`  generatedAt           : ${report.generatedAt}`);
  console.log('');

  if (report.mismatches.length > 0) {
    console.log('Mismatches (each row is a misclassified user):');
    console.log(
      '  ─────────────────────────────────────────────────────────────────',
    );
    for (const m of report.mismatches) {
      console.log(
        `  ${m.username.padEnd(24)} ` +
          `safariRole=${String(m.safariRole).padEnd(24)} ` +
          `role.name=${m.roleName ?? '<NULL>'}`,
      );
    }
    console.log('');
    console.log(
      'NEXT STEP: fix at the source (the seed/script/SQL that wrote one column without the other).',
    );
    console.log(
      'NEVER auto-correct: a silent rewrite hides the producer that introduced the drift.',
    );
    process.exit(1);
  }

  console.log('OK — every active user has matching safariRole and role.name.');
  process.exit(0);
} catch (e) {
  console.error('ERROR:', e instanceof Error ? e.message : String(e));
  process.exit(2);
}
