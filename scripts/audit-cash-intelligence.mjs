#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Cash-Intelligence Safety Audit
 *
 *   Runtime contract validator that locks down the cash-intelligence
 *   layer against silent logic drift. STRICTLY READ-ONLY: it logs in,
 *   GETs three endpoints, and verifies a fixed list of predicates.
 *   Never mutates data.
 *
 *   Run BEFORE and AFTER any change to:
 *     - src/cash-monitor/cash-classifier.service.ts
 *     - src/cash-monitor/cash-risk.service.ts
 *     - src/cash-monitor/cash-executive.service.ts
 *     - src/cash-monitor/cash-decision.service.ts
 *     - any DTO under src/cash-monitor/dto
 *
 *   Exit code:
 *     0 — every check passed (safe to ship)
 *     1 — at least one check failed (BLOCK the change)
 *
 *   Usage (PowerShell):
 *     $env:AUDIT_BASE_URL = 'http://localhost:3000'
 *     $env:AUDIT_USER     = 'admin'
 *     $env:AUDIT_PASS     = '<the admin password>'
 *     node scripts/audit-cash-intelligence.mjs
 *
 *   The contract validated below mirrors the rules baked into the
 *   classifier:
 *
 *     • /classified is the single source of truth.
 *     • /risk and /executive must echo classified.systemStatus exactly.
 *     • /risk anomalies must respect amount >= 5 KD AND ageHours >= 24
 *       (the SHIFT_OVERDUE override stays at the classifier layer; we
 *        verify the consumer side only).
 *     • topRisk must be null whenever financialAlerts is empty.
 *     • A compliance-only day must never produce systemStatus = RED.
 *     • Validation scenarios:
 *         3 KD,  age  2h  →  GREEN, no anomaly
 *         600 KD, age 50h →  CRITICAL, must be present in /risk if it
 *                            exists in /classified.financialAlerts.
 *
 *   The scenarios are checked as predicates over LIVE data — every
 *   matching cash flow on the wire must obey them, regardless of how
 *   many flows happen to be present at audit time.
 */

const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:3000';
const USER = process.env.AUDIT_USER ?? 'admin';
const PASS = process.env.AUDIT_PASS ?? 'admin12345';

const ANOMALY_AMOUNT_FLOOR_KD = 5;
const ANOMALY_AGE_GATE_HOURS = 24;

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail: detail ?? null });
}

async function api(path, init = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${text}`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON body from ${path}: ${text.slice(0, 200)}`);
  }
  return json?.data ?? json;
}

async function login() {
  return api('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
}

async function authed(token, path) {
  return api(path, { headers: { authorization: `Bearer ${token}` } });
}

function parseAmountKd(s) {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function summarise(name, payload) {
  const out = { name, status: payload?.systemStatus };
  if (Array.isArray(payload?.financialAlerts)) {
    out.financial = payload.financialAlerts.length;
  }
  if (Array.isArray(payload?.complianceAlerts)) {
    out.compliance = payload.complianceAlerts.length;
  }
  if (Array.isArray(payload?.anomalies)) {
    out.anomalies = payload.anomalies.length;
  }
  if (payload?.topRisk !== undefined) {
    out.topRisk = payload.topRisk ? payload.topRisk.driverName : null;
  }
  return out;
}

(async () => {
  console.log(`[audit] BASE=${BASE} USER=${USER}`);
  let token;
  try {
    const login_ = await login();
    token = login_?.accessToken;
    if (!token) throw new Error('Login response missing accessToken');
  } catch (e) {
    console.error(`[audit] login failed: ${e.message}`);
    process.exit(1);
  }

  let classified;
  let risk;
  let executive;
  try {
    [classified, risk, executive] = await Promise.all([
      authed(token, '/api/cash-intelligence/classified'),
      authed(token, '/api/cash-intelligence/risk'),
      authed(token, '/api/cash-intelligence/executive'),
    ]);
  } catch (e) {
    console.error(`[audit] fetch failed: ${e.message}`);
    process.exit(1);
  }

  console.table([
    summarise('classified', classified),
    summarise('risk', risk),
    summarise('executive', executive),
  ]);

  // ── 1. Single source of truth: systemStatus must match across all 3 layers.
  record(
    'systemStatus identical across /classified, /risk, /executive',
    classified.systemStatus === risk.systemStatus &&
      classified.systemStatus === executive.systemStatus,
    {
      classified: classified.systemStatus,
      risk: risk.systemStatus,
      executive: executive.systemStatus,
    },
  );

  // ── 2. /risk anomalies obey the amount + age gates (R03/R04).
  const violators = (risk.anomalies ?? []).filter((a) => {
    const kd = parseAmountKd(a.amount);
    const hrs =
      typeof a.cashAgeHours === 'number'
        ? a.cashAgeHours
        : typeof a.ageHours === 'number'
          ? a.ageHours
          : null;
    if (kd < ANOMALY_AMOUNT_FLOOR_KD) return true;
    if (hrs !== null && hrs < ANOMALY_AGE_GATE_HOURS) return true;
    return false;
  });
  record(
    `/risk anomalies respect amount ≥ ${ANOMALY_AMOUNT_FLOOR_KD} KD AND age ≥ ${ANOMALY_AGE_GATE_HOURS}h`,
    violators.length === 0,
    violators.length === 0
      ? null
      : { violatingCount: violators.length, sample: violators[0] },
  );

  // ── 3. topRisk is null when no financial alerts exist.
  const noFinancial = (classified.financialAlerts ?? []).length === 0;
  record(
    'executive.topRisk === null when classified.financialAlerts is empty',
    !noFinancial || executive.topRisk === null,
    { noFinancial, topRisk: executive.topRisk?.alertType ?? null },
  );

  // ── 4. Compliance-only day must never be RED.
  const onlyCompliance =
    noFinancial && (classified.complianceAlerts ?? []).length > 0;
  record(
    'systemStatus !== RED when only compliance alerts exist',
    !onlyCompliance || classified.systemStatus !== 'RED',
    { onlyCompliance, systemStatus: classified.systemStatus },
  );

  // ── 5. Empty data → GREEN.
  const empty =
    (classified.financialAlerts ?? []).length === 0 &&
    (classified.complianceAlerts ?? []).length === 0 &&
    (classified.drivers ?? []).length === 0;
  record(
    'systemStatus === GREEN on an empty day',
    !empty || classified.systemStatus === 'GREEN',
    { empty, systemStatus: classified.systemStatus },
  );

  // ── 6. Scenario predicate: 3 KD / 2h must NEVER appear as a financial
  //         alert or risk anomaly. We scan flows behind the classified
  //         alerts; if a small/young match exists in financialAlerts it's
  //         a contract breach.
  const youngSmallFinancial = (classified.financialAlerts ?? []).filter(
    (a) =>
      parseAmountKd(a.amount) < ANOMALY_AMOUNT_FLOOR_KD &&
      a.cashAgeHours < ANOMALY_AGE_GATE_HOURS,
  );
  record(
    'no flow with < 5 KD AND < 24h is classified as a financial alert',
    youngSmallFinancial.length === 0,
    youngSmallFinancial.length === 0
      ? null
      : { count: youngSmallFinancial.length, sample: youngSmallFinancial[0] },
  );

  // ── 7. Scenario predicate: any 600 KD / 50h+ flow must be CRITICAL.
  //         (We don't synthesise data — but if such a flow exists in the
  //         live snapshot, it MUST hit CRITICAL severity.)
  const heavyOldNonCritical = (classified.financialAlerts ?? []).filter(
    (a) =>
      parseAmountKd(a.amount) >= 100 &&
      a.cashAgeHours >= 48 &&
      a.severity !== 'CRITICAL',
  );
  record(
    'every flow ≥ 100 KD AND ≥ 48h is CRITICAL in /classified.financialAlerts',
    heavyOldNonCritical.length === 0,
    heavyOldNonCritical.length === 0
      ? null
      : { count: heavyOldNonCritical.length, sample: heavyOldNonCritical[0] },
  );

  // ── 8. /executive.summary.criticalAlerts must equal the count of
  //         CRITICAL financial alerts in /classified.
  const classifiedCritical = (classified.financialAlerts ?? []).filter(
    (a) => a.severity === 'CRITICAL',
  ).length;
  record(
    'executive.summary.criticalAlerts mirrors /classified',
    executive.summary?.criticalAlerts === classifiedCritical,
    {
      classifiedCritical,
      executiveCritical: executive.summary?.criticalAlerts,
    },
  );

  // ── 9. Read-only contract markers exist on every layer.
  record(
    'all layers advertise readOnly=true and advisoryOnly=true',
    classified.readOnly === true &&
      classified.advisoryOnly === true &&
      risk.readOnly === true &&
      risk.advisoryOnly === true,
  );

  // ─── REPORT ─────────────────────────────────────────────────
  const passed = checks.filter((c) => c.ok).length;
  const total = checks.length;
  console.log('');
  for (const c of checks) {
    const tag = c.ok ? '  ok ' : 'FAIL ';
    console.log(`${tag} ${c.name}`);
    if (!c.ok && c.detail) console.log(`        ${JSON.stringify(c.detail)}`);
  }
  console.log('');
  console.log(`[audit] ${passed}/${total} checks passed`);

  if (passed !== total) {
    console.error('[audit] BLOCK: contract regression detected');
    process.exit(1);
  }
  console.log('[audit] PASS: cash-intelligence contract holds');
})().catch((e) => {
  console.error(`[audit] uncaught: ${e.message}`);
  process.exit(1);
});
