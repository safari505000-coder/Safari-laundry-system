#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Validation proof for GET /api/cash-intelligence/dashboard.
 *
 * Read-only. Logs in, fetches /dashboard alongside /classified +
 * /executive + /verify, then asserts the SSoT and frontend contracts:
 *
 *   1. dashboard.systemStatus === classified.systemStatus
 *   2. dashboard.systemStatus === executive.systemStatus
 *   3. dashboard.totalCash    === Σ classified.drivers[].amount (4dp)
 *   4. dashboard.drivers[].totalCash === classified.drivers[].amount
 *   5. dashboard.summaryText  === { GREEN: مستقر, YELLOW: انتباه تشغيلي, RED: خطر مالي }
 *   6. dashboard.alerts.financial / .compliance verbatim from classifier
 *   7. dashboard.topRisk === executive.topRisk (deep equal)
 *   8. Every monetary string is fixed-4 KD
 *   9. Stable keys present + non-undefined
 *  10. /verify report STILL passes (no regression on the system-verify
 *      contract).
 *
 * Exit 0 = ALL checks pass. Exit 1 = any failure.
 */

const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:3000';
const USER = process.env.AUDIT_USER ?? 'admin';
const PASS = process.env.AUDIT_PASS ?? 'admin';

const SUMMARY_TEXT = {
  GREEN: 'مستقر',
  YELLOW: 'انتباه تشغيلي',
  RED: 'خطر مالي',
};
const FLOOR_KD = 5;
const GRACE_HOURS = 24;

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail: detail ?? null });
}

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${text}`);
  }
  const json = JSON.parse(text);
  return json?.data ?? json;
}
async function authed(token, path) {
  return api(path, { headers: { authorization: `Bearer ${token}` } });
}

function fixed4(s) {
  return typeof s === 'string' && /^-?\d+\.\d{4}$/.test(s);
}
function sumKdLabel(drivers) {
  const sum = drivers.reduce((s, d) => s + Number.parseFloat(d.amount), 0);
  return sum.toFixed(4);
}

(async () => {
  console.log(`[verify-dashboard] BASE=${BASE} USER=${USER}`);
  let token;
  try {
    const login = await api('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: USER, password: PASS }),
    });
    token = login?.accessToken;
    if (!token) throw new Error('Login response missing accessToken');
  } catch (e) {
    console.error(`[verify-dashboard] login failed: ${e.message}`);
    process.exit(1);
  }

  let dashboard;
  let classified;
  let executive;
  let verify;
  try {
    [dashboard, classified, executive, verify] = await Promise.all([
      authed(token, '/api/cash-intelligence/dashboard'),
      authed(token, '/api/cash-intelligence/classified'),
      authed(token, '/api/cash-intelligence/executive'),
      authed(token, '/api/cash-intelligence/verify'),
    ]);
  } catch (e) {
    console.error(`[verify-dashboard] fetch failed: ${e.message}`);
    process.exit(1);
  }

  console.table([
    {
      layer: 'classified',
      status: classified.systemStatus,
      drivers: classified.drivers.length,
      financial: classified.financialAlerts.length,
      compliance: classified.complianceAlerts.length,
      sumKd: sumKdLabel(classified.drivers),
    },
    {
      layer: 'executive',
      status: executive.systemStatus,
      drivers: '-',
      financial: '-',
      compliance: '-',
      sumKd: executive.auditReference.totalCashInFlight,
    },
    {
      layer: 'dashboard',
      status: dashboard.systemStatus,
      drivers: dashboard.drivers.length,
      financial: dashboard.alerts.financial.length,
      compliance: dashboard.alerts.compliance.length,
      sumKd: dashboard.totalCash,
    },
  ]);

  // 1) cross-layer status: classifier == dashboard
  record(
    'dashboard.systemStatus === classified.systemStatus',
    dashboard.systemStatus === classified.systemStatus,
    { dashboard: dashboard.systemStatus, classified: classified.systemStatus },
  );

  // 2) cross-layer status: executive == dashboard
  record(
    'dashboard.systemStatus === executive.systemStatus',
    dashboard.systemStatus === executive.systemStatus,
    { dashboard: dashboard.systemStatus, executive: executive.systemStatus },
  );

  // 3) totalCash invariant
  const ssotTotal = sumKdLabel(classified.drivers);
  record(
    'dashboard.totalCash === Σ classified.drivers[].amount',
    dashboard.totalCash === ssotTotal,
    { dashboard: dashboard.totalCash, ssot: ssotTotal },
  );

  // 4) per-driver totalCash mirrors classifier amount, key-by-key
  const classMap = new Map(classified.drivers.map((d) => [d.driverId, d]));
  const driverDrift = dashboard.drivers
    .map((d) => {
      const c = classMap.get(d.driverId);
      return c && d.totalCash === c.amount ? null : { driverId: d.driverId, dash: d.totalCash, classified: c?.amount };
    })
    .filter(Boolean);
  record(
    'dashboard.drivers[].totalCash === classified.drivers[].amount (key-by-key)',
    driverDrift.length === 0,
    driverDrift.length === 0 ? null : { drift: driverDrift },
  );
  record(
    'dashboard.drivers length === classified.drivers length',
    dashboard.drivers.length === classified.drivers.length,
    { dashboard: dashboard.drivers.length, classified: classified.drivers.length },
  );

  // 5) summaryText derived ONLY from systemStatus
  record(
    'dashboard.summaryText derived from systemStatus',
    dashboard.summaryText === SUMMARY_TEXT[dashboard.systemStatus],
    { actual: dashboard.summaryText, expected: SUMMARY_TEXT[dashboard.systemStatus] },
  );

  // 6) alerts verbatim
  record(
    'dashboard.alerts.financial mirrors classified.financialAlerts',
    JSON.stringify(dashboard.alerts.financial) === JSON.stringify(classified.financialAlerts),
    {
      dashboardLen: dashboard.alerts.financial.length,
      classifiedLen: classified.financialAlerts.length,
    },
  );
  record(
    'dashboard.alerts.compliance mirrors classified.complianceAlerts',
    JSON.stringify(dashboard.alerts.compliance) === JSON.stringify(classified.complianceAlerts),
    {
      dashboardLen: dashboard.alerts.compliance.length,
      classifiedLen: classified.complianceAlerts.length,
    },
  );

  // 7) topRisk verbatim
  record(
    'dashboard.topRisk === executive.topRisk',
    JSON.stringify(dashboard.topRisk) === JSON.stringify(executive.topRisk),
    { dashboardNull: dashboard.topRisk === null, execNull: executive.topRisk === null },
  );

  // 8) money formatting: every monetary string is fixed-4
  const badAmounts = [];
  if (!fixed4(dashboard.totalCash)) badAmounts.push({ field: 'totalCash', value: dashboard.totalCash });
  for (const d of dashboard.drivers) {
    if (!fixed4(d.totalCash)) badAmounts.push({ field: `driver.${d.driverId}.totalCash`, value: d.totalCash });
  }
  for (const a of dashboard.alerts.financial) {
    if (a.amount != null && !fixed4(a.amount)) badAmounts.push({ field: `financial.${a.type}.amount`, value: a.amount });
  }
  for (const a of dashboard.alerts.compliance) {
    if (a.amount != null && !fixed4(a.amount)) badAmounts.push({ field: `compliance.${a.type}.amount`, value: a.amount });
  }
  record(
    'every monetary string is fixed-4 KD',
    badAmounts.length === 0,
    badAmounts.length === 0 ? null : { violations: badAmounts.slice(0, 3) },
  );

  // 9) stable keys / no missing fields
  const requiredTop = ['systemStatus', 'totalCash', 'summaryText', 'alerts', 'drivers', 'topRisk', 'generatedAt', 'readOnly', 'advisoryOnly'];
  const missing = requiredTop.filter((k) => !(k in dashboard));
  record(
    'response carries all required top-level keys',
    missing.length === 0,
    missing.length === 0 ? null : { missing },
  );
  const hasAlertBuckets = !!dashboard.alerts && Array.isArray(dashboard.alerts.financial) && Array.isArray(dashboard.alerts.compliance);
  record('alerts.{financial,compliance} are arrays', hasAlertBuckets, null);

  // 10) safety scenario predicates against LIVE classifier output
  const subFloor = classified.financialAlerts.filter(
    (a) => Number.parseFloat(a.amount) < FLOOR_KD,
  );
  record(
    `Scenario A: no financial alert below ${FLOOR_KD} KD floor (e.g. 3 KD / 2h must NOT be flagged)`,
    subFloor.length === 0,
    subFloor.length === 0 ? null : { violations: subFloor.slice(0, 2) },
  );
  const inGrace = classified.financialAlerts.filter(
    (a) => a.cashAgeHours < GRACE_HOURS,
  );
  record(
    `Scenario A: no financial alert inside ${GRACE_HOURS}h grace`,
    inGrace.length === 0,
    inGrace.length === 0 ? null : { violations: inGrace.slice(0, 2) },
  );
  // Scenario B: when there IS a flow ≥ 5 KD AND ≥ 24h, classifier MUST
  // surface at least one CRITICAL row and dashboard MUST echo RED.
  const ripe = classified.drivers.filter(
    (d) => Number.parseFloat(d.amount) >= 5 && d.cashAgeHours >= 24,
  );
  if (ripe.length > 0) {
    const hasCritical = classified.financialAlerts.some((a) => a.severity === 'CRITICAL');
    record(
      'Scenario B: ripe ≥5 KD/≥24h → at least one CRITICAL financial alert',
      hasCritical,
      { ripe: ripe.length, criticals: classified.financialAlerts.filter((a) => a.severity === 'CRITICAL').length },
    );
    record(
      'Scenario B: ripe → dashboard.systemStatus === RED',
      dashboard.systemStatus === 'RED',
      { observed: dashboard.systemStatus, ripeSample: ripe[0] },
    );
  } else {
    record(
      'Scenario B: no ripe ≥5/≥24h flow on the wire — predicate skipped',
      true,
      { ripe: 0 },
    );
  }

  // /verify still PASS (regression net)
  record(
    '/api/cash-intelligence/verify still reports PASS',
    verify.summary === 'PASS' || verify.status === 'PASS' || verify.allPassed === true,
    { verifySummary: verify.summary ?? verify.status ?? verify.allPassed },
  );

  console.log('');
  console.log('[verify-dashboard] result:');
  for (const c of checks) {
    console.log(`  [${c.ok ? 'PASS' : 'FAIL'}] ${c.name}`);
    if (!c.ok && c.detail) console.log(`         ${JSON.stringify(c.detail)}`);
  }
  const failed = checks.filter((c) => !c.ok);
  console.log('');
  console.log(`[verify-dashboard] ${checks.length - failed.length}/${checks.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
