# Safari ERP — Load Test Suite (k6)

[k6](https://k6.io/) load scenarios for the critical request paths. Scripts are
**read-only by default** so they are safe to point at a staging environment;
write load is provided as commented templates and must only run against a
disposable database.

## Prerequisites

- Install k6: `winget install k6` (Windows) / `brew install k6` (macOS) /
  see <https://k6.io/docs/get-started/installation/>.
- A running API and valid staff credentials.

## Configuration (environment variables)

| Variable     | Default                  | Description                          |
| ------------ | ------------------------ | ------------------------------------ |
| `BASE_URL`   | `http://localhost:3000`  | API origin                           |
| `API_PREFIX` | `/api`                   | Global route prefix                  |
| `USERNAME`   | `owner`                  | Staff username for auth scenarios    |
| `PASSWORD`   | `changeme`               | Staff password                       |
| `VUS`        | `10` (varies per script) | Virtual users                        |
| `DURATION`   | `30s`                    | Test duration                        |

## Running

```bash
# from repo root
k6 run tests/load/login.test.js
k6 run -e BASE_URL=https://staging.example.com -e USERNAME=owner -e PASSWORD=*** tests/load/orders.test.js
k6 run tests/load/invoices.test.js
k6 run tests/load/payments.test.js
k6 run tests/load/reports.test.js
```

Export a JSON summary for the results template:

```bash
k6 run --summary-export=summary.json tests/load/orders.test.js
```

## Scenarios

| File                | Path(s) exercised                                            |
| ------------------- | ----------------------------------------------------------- |
| `login.test.js`     | `POST /api/auth/login`                                      |
| `orders.test.js`    | `GET /api/orders`                                           |
| `invoices.test.js`  | `GET /api/reports/issued-invoices`, `GET /api/finance/invoices` |
| `payments.test.js`  | `GET /api/payments`                                         |
| `reports.test.js`   | `GET /api/reports/executive-summary`, `/monthly-summary`   |

## Thresholds

Default pass/fail gates (`config.js`):

- `http_req_failed` < 1%
- `http_req_duration` p95 < 800ms, p99 < 2s (reports relaxed).

Record outcomes in [`LOAD_TEST_RESULTS_TEMPLATE.md`](./LOAD_TEST_RESULTS_TEMPLATE.md).
