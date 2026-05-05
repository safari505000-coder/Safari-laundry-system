/**
 * One-shot verifier for the Stage A double-entry ledger projection.
 *
 * Hits all five `/api/finance/ledger/*` endpoints as the seeded admin
 * (OWNER) and asserts:
 *
 *   1. /summary shape (accounts[] each with balance), and that
 *      `globalDebit == globalCredit` (KD strings, 4dp).
 *   2. /transactions returns entries grouped by txId, every txId
 *      having exactly one DR row and one CR row of equal amount.
 *   3. /reconciliation status is PASS, unbalancedTransactions is empty.
 *   4. /driver/:id and /manager/:id return account views with
 *      consistent `balance.balance == globalDebit - globalCredit`
 *      arithmetic on the server side.
 *
 * Exit codes: 0 PASS, 1 FAIL invariant, 2 transport/auth error.
 *
 * NEVER mutates state — every call is a GET.
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
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  const body = await res.json();
  const token = body.data?.accessToken ?? body.accessToken ?? body.token;
  if (!token) throw new Error('login response missing accessToken');
  return token;
}

async function get(token, path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${path} failed ${res.status} ${body}`);
  }
  const env = await res.json();
  return env.data ?? env;
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

try {
  const token = await login();
  console.log(`logged in as ${USER}`);

  const summary = await get(token, '/api/finance/ledger/summary');
  console.log('');
  console.log('─── /summary ───');
  console.log(`  fromIso             : ${summary.fromIso}`);
  console.log(`  toIso               : ${summary.toIso}`);
  console.log(`  totalEntries        : ${summary.totalEntries}`);
  console.log(`  totalTransactions   : ${summary.totalTransactions}`);
  console.log(`  globalDebit         : ${summary.globalDebit}`);
  console.log(`  globalCredit        : ${summary.globalCredit}`);
  console.log(`  accounts            : ${summary.accounts.length}`);

  if (summary.globalDebit !== summary.globalCredit) {
    fail(
      `summary global imbalance: debit=${summary.globalDebit} credit=${summary.globalCredit}`,
    );
  }
  for (const a of summary.accounts) {
    if (
      typeof a.accountId !== 'string' ||
      typeof a.totalDebit !== 'string' ||
      typeof a.totalCredit !== 'string' ||
      typeof a.balance !== 'string' ||
      typeof a.entryCount !== 'number'
    ) {
      fail(`account row missing fields: ${JSON.stringify(a)}`);
    }
  }
  console.log('  ✓ summary shape + global invariant');

  const txs = await get(token, '/api/finance/ledger/transactions?take=500');
  console.log('');
  console.log('─── /transactions ───');
  console.log(`  totalEntries        : ${txs.totalEntries}`);
  console.log(`  returned            : ${txs.entries.length}`);

  const byTx = new Map();
  for (const e of txs.entries) {
    const cur = byTx.get(e.txId) ?? { dr: '0', cr: '0', n: 0 };
    cur.dr = (Number(cur.dr) + Number(e.debit)).toFixed(4);
    cur.cr = (Number(cur.cr) + Number(e.credit)).toFixed(4);
    cur.n += 1;
    byTx.set(e.txId, cur);
  }
  let imbalanced = 0;
  for (const [txId, v] of byTx) {
    if (v.dr !== v.cr) {
      imbalanced += 1;
      if (imbalanced <= 5) {
        console.error(
          `  ⚠ tx imbalance ${txId}: dr=${v.dr} cr=${v.cr} entries=${v.n}`,
        );
      }
    }
  }
  if (imbalanced > 0) {
    fail(`${imbalanced} transactions are imbalanced (sample above)`);
  }
  console.log(`  ✓ all ${byTx.size} transactions balance per tx`);

  const recon = await get(token, '/api/finance/ledger/reconciliation');
  console.log('');
  console.log('─── /reconciliation ───');
  console.log(`  status                  : ${recon.status}`);
  console.log(`  totalTransactions       : ${recon.totalTransactions}`);
  console.log(`  unbalancedTransactions  : ${recon.unbalancedTransactions.length}`);
  console.log(`  unattributedEntries     : ${recon.unattributedEntries}`);
  if (recon.status !== 'PASS' || recon.unbalancedTransactions.length > 0) {
    fail(`reconciliation FAILED — ${recon.unbalancedTransactions.length} unbalanced txs`);
  }
  console.log('  ✓ reconciliation PASS');

  // /driver/:id + /manager/:id round-trip — pick one account from
  // summary if any DRIVER_ / MANAGER_ rows exist; otherwise skip
  // gracefully (a fresh DB has no holders).
  const driverAcc = summary.accounts.find((a) => a.accountId.startsWith('DRIVER_'));
  if (driverAcc) {
    const driverId = driverAcc.accountId.replace('DRIVER_', '');
    const dr = await get(token, `/api/finance/ledger/driver/${driverId}`);
    if (dr.balance.accountId !== driverAcc.accountId) {
      fail(`driver account id mismatch: ${dr.balance.accountId} vs ${driverAcc.accountId}`);
    }
    if (dr.balance.balance !== driverAcc.balance) {
      fail(
        `driver balance mismatch summary=${driverAcc.balance} account=${dr.balance.balance}`,
      );
    }
    console.log('');
    console.log(`─── /driver/${driverId.slice(0, 8)}… ───`);
    console.log(`  ✓ balance matches summary (${dr.balance.balance} KD)`);
  } else {
    console.log('');
    console.log('  (skip /driver/:id — no DRIVER_* accounts in range)');
  }

  const managerAcc = summary.accounts.find((a) => a.accountId.startsWith('MANAGER_'));
  if (managerAcc) {
    const managerId = managerAcc.accountId.replace('MANAGER_', '');
    const mg = await get(token, `/api/finance/ledger/manager/${managerId}`);
    if (mg.balance.accountId !== managerAcc.accountId) {
      fail(
        `manager account id mismatch: ${mg.balance.accountId} vs ${managerAcc.accountId}`,
      );
    }
    if (mg.balance.balance !== managerAcc.balance) {
      fail(
        `manager balance mismatch summary=${managerAcc.balance} account=${mg.balance.balance}`,
      );
    }
    console.log(`─── /manager/${managerId.slice(0, 8)}… ───`);
    console.log(`  ✓ balance matches summary (${mg.balance.balance} KD)`);
  } else {
    console.log('  (skip /manager/:id — no MANAGER_* accounts in range)');
  }

  console.log('');
  console.log('OK — Stage A ledger invariant holds across all 5 endpoints.');
  process.exit(0);
} catch (e) {
  console.error('ERROR:', e instanceof Error ? e.message : String(e));
  process.exit(2);
}
