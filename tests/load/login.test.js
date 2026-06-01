// Load scenario: authentication throughput.
import { check, sleep } from 'k6';
import http from 'k6/http';
import { url, USERNAME, PASSWORD, baseThresholds } from './config.js';

export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    ...baseThresholds,
    'http_req_duration{name:login}': ['p(95)<1000'],
  },
};

export default function () {
  const res = http.post(
    url('/auth/login'),
    JSON.stringify({ username: USERNAME, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'login' } },
  );
  check(res, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
    'returns accessToken': (r) => {
      try {
        return Boolean(JSON.parse(r.body).accessToken);
      } catch (_e) {
        return false;
      }
    },
  });
  sleep(1);
}
