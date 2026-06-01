# Load Test Results — Safari ERP

> Copy this file to `LOAD_TEST_RESULTS_<YYYY-MM-DD>.md` and fill it in after each run.

## Run metadata

| Field             | Value                                  |
| ----------------- | -------------------------------------- |
| Date / time       |                                        |
| Environment       | staging / pre-prod / prod-readonly     |
| Target `BASE_URL` |                                        |
| k6 version        |                                        |
| Git commit        |                                        |
| Run by            |                                        |
| Dataset size      | orders: ___  customers: ___            |

## Configuration

| Scenario | VUs | Duration | Notes |
| -------- | --- | -------- | ----- |
| login    |     |          |       |
| orders   |     |          |       |
| invoices |     |          |       |
| payments |     |          |       |
| reports  |     |          |       |

## Results

| Scenario | Reqs | RPS | p50 (ms) | p95 (ms) | p99 (ms) | Error % | Pass/Fail |
| -------- | ---- | --- | -------- | -------- | -------- | ------- | --------- |
| login    |      |     |          |          |          |         |           |
| orders   |      |     |          |          |          |         |           |
| invoices |      |     |          |          |          |         |           |
| payments |      |     |          |          |          |         |           |
| reports  |      |     |          |          |          |         |           |

## Threshold compliance

- [ ] `http_req_failed` < 1%
- [ ] `http_req_duration` p95 < 800ms (reports < 3000ms)
- [ ] No 5xx responses
- [ ] DB connection pool not exhausted
- [ ] Redis stable (no evictions / timeouts)

## Resource utilisation (during peak)

| Metric          | Value |
| --------------- | ----- |
| API CPU %       |       |
| API memory      |       |
| DB CPU %        |       |
| DB connections  |       |
| Redis memory    |       |

## Observations / regressions

-

## Action items

- [ ]
