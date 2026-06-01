// Shared k6 configuration + helpers for the Safari ERP load suite.
//
// All scripts read configuration from environment variables so the same
// suite runs against local / staging without code changes:
//
//   BASE_URL   default http://localhost:3000
//   API_PREFIX default /api
//   USERNAME   staff username for the authenticated scenarios
//   PASSWORD   staff password
//   VUS        virtual users (default 10)
//   DURATION   test duration (default 30s)
//
// SAFETY: by default every scenario only performs READ (GET) requests so it
// is safe to point at a non-production environment. Write load (creating
// orders / payments) is provided as commented templates and must only be run
// against a disposable staging database.

import http from 'k6/http';
import { check } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
export const API_PREFIX = __ENV.API_PREFIX || '/api';
export const USERNAME = __ENV.USERNAME || 'owner';
export const PASSWORD = __ENV.PASSWORD || 'changeme';

export function url(path) {
  return `${BASE_URL}${API_PREFIX}${path}`;
}

// Default thresholds applied to every scenario (override per-file as needed).
export const baseThresholds = {
  http_req_failed: ['rate<0.01'], // < 1% errors
  http_req_duration: ['p(95)<800', 'p(99)<2000'],
};

export const defaultOptions = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '30s',
  thresholds: baseThresholds,
};

// Authenticate once and return a Bearer token (or null on failure).
export function login(username = USERNAME, password = PASSWORD) {
  const res = http.post(
    url('/auth/login'),
    JSON.stringify({ username, password }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'login' } },
  );
  check(res, { 'login 2xx': (r) => r.status >= 200 && r.status < 300 });
  if (res.status < 200 || res.status >= 300) {
    return null;
  }
  try {
    return JSON.parse(res.body).accessToken || null;
  } catch (_e) {
    return null;
  }
}

export function authHeaders(token) {
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
}
