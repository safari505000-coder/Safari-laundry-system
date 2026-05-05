import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

export const errorRate = new Rate('errors');

export const options = {
  scenarios: {
    payment_status: {
      executor: 'constant-arrival-rate',
      rate: 1000,
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 200,
      maxVUs: 1000,
      exec: 'paymentStatus',
    },
    alert_events: {
      executor: 'constant-arrival-rate',
      rate: 500,
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 100,
      maxVUs: 500,
      exec: 'alertMetrics',
    },
    whatsapp_jobs: {
      executor: 'constant-arrival-rate',
      rate: 200,
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 50,
      maxVUs: 250,
      exec: 'whatsappProbe',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<750'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api';
const ORDER_ID = __ENV.ORDER_ID || '00000000-0000-4000-8000-000000000000';

export function paymentStatus() {
  const res = http.get(`${BASE_URL}/payments/status/${ORDER_ID}?result=CAPTURED`);
  errorRate.add(res.status >= 500);
  check(res, { 'payment status non-5xx': (r) => r.status < 500 });
}

export function alertMetrics() {
  const res = http.get(`${BASE_URL}/metrics/queues`);
  errorRate.add(res.status >= 500);
  check(res, { 'metrics ok': (r) => r.status < 500 });
}

export function whatsappProbe() {
  const res = http.get(`${BASE_URL}/health/live`);
  errorRate.add(res.status >= 500);
  check(res, { 'live ok': (r) => r.status === 200 });
  sleep(0.01);
}
