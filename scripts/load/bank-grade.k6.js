/**
 * k6 load script — targets Prometheus/SLO validation.
 * Usage: k6 run scripts/load/bank-grade.k6.js
 * Env: BASE_URL (default http://127.0.0.1:3000)
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const payLatency = new Trend('payment_cb_latency');
const payErrors = new Rate('payment_cb_errors');
const alertLatency = new Trend('alert_events_latency');
const alertErrors = new Rate('alert_events_errors');
const waLatency = new Trend('whatsapp_jobs_latency');
const waErrors = new Rate('whatsapp_jobs_errors');
const payCounter = new Counter('payment_cb_reqs');
const alertCounter = new Counter('alert_event_reqs');
const waCounter = new Counter('whatsapp_job_reqs');

const BASE = __ENV.BASE_URL || 'http://127.0.0.1:3000';

export const options = {
  scenarios: {
    payments: {
      executor: 'constant-arrival-rate',
      rate: 1000,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 500,
      maxVUs: 2000,
      exec: 'paymentCallback',
    },
    alerts: {
      executor: 'constant-arrival-rate',
      rate: 500,
      timeUnit: '1s',
      duration: '30s',
      startTime: '2s',
      preAllocatedVUs: 200,
      maxVUs: 1000,
      exec: 'alertBurst',
    },
    whatsapp: {
      executor: 'constant-arrival-rate',
      rate: 200,
      timeUnit: '1s',
      duration: '30s',
      startTime: '4s',
      preAllocatedVUs: 100,
      maxVUs: 500,
      exec: 'whatsappBurst',
    },
  },
  thresholds: {
    payment_cb_errors: ['rate<0.05'],
    alert_events_errors: ['rate<0.10'],
    whatsapp_jobs_errors: ['rate<0.10'],
  },
};

/** Placeholder bodies — wire to real endpoints / auth in your environment. */
export function paymentCallback() {
  const res = http.post(
    `${BASE}/api/payments/callback`,
    JSON.stringify({ orderId: '00000000-0000-4000-8000-000000000000', status: 'failed' }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'payment_cb' } },
  );
  payLatency.add(res.timings.duration);
  payCounter.add(1);
  const ok = check(res, { 'callback status': (r) => r.status === 200 || r.status === 401 });
  payErrors.add(!ok);
  sleep(0.001);
}

export function alertBurst() {
  const res = http.get(`${BASE}/health/live`, { tags: { name: 'alert_proxy' } });
  alertLatency.add(res.timings.duration);
  alertCounter.add(1);
  const ok = check(res, { 'live': (r) => r.status === 200 });
  alertErrors.add(!ok);
  sleep(0.001);
}

export function whatsappBurst() {
  const res = http.get(`${BASE}/health/ready`, { tags: { name: 'wa_proxy' } });
  waLatency.add(res.timings.duration);
  waCounter.add(1);
  const ok = check(res, { 'ready': (r) => r.status === 200 || r.status === 503 });
  waErrors.add(!ok);
  sleep(0.001);
}

export function handleSummary(data) {
  return {
    stdout: JSON.stringify(
      {
        throughput_rps_estimate: data.metrics?.http_reqs?.values?.rate,
        http_req_duration: data.metrics?.http_req_duration?.values,
        payment_cb_latency: data.metrics?.payment_cb_latency?.values,
        payment_cb_errors: data.metrics?.payment_cb_errors?.values,
        alert_events_latency: data.metrics?.alert_events_latency?.values,
        whatsapp_jobs_latency: data.metrics?.whatsapp_jobs_latency?.values,
      },
      null,
      2,
    ),
  };
}
