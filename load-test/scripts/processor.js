/**
 * Artillery processor — shared helpers for login, JWT caching, and random picks.
 *
 * Notes:
 *  - `/api/auth/login` returns `{ meta, data: { accessToken, user } }` — we unwrap.
 *  - Drivers create orders via `POST /api/orders/quick`.
 *  - Managers create orders via `POST /api/orders`.
 *  - Payment callback uses `devMock: true` which is allowed because the backend
 *    was started with `PAYMENTS_MOCK=true` (see load-test/.env.loadtest).
 */
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const fixturesPath = path.resolve(__dirname, '..', 'fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

const tokenCache = new Map();

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function setAdminCredentials(context, events, done) {
  context.vars.adminUsername = 'admin';
  context.vars.adminPassword = 'admin';
  done();
}

function setManagerCredentials(context, events, done) {
  context.vars.managerUsername = fixtures.manager.username;
  context.vars.managerPassword = fixtures.manager.password;
  done();
}

function setDriverCredentials(context, events, done) {
  const d = pick(fixtures.drivers);
  context.vars.driverUsername = d.username;
  context.vars.driverPassword = d.password;
  done();
}

function setRandomCustomer(context, events, done) {
  const c = pick(fixtures.customers);
  context.vars.customerId = c.id;
  context.vars.customerPhone = c.phone;
  context.vars.totalPrice = Number((5 + Math.random() * 45).toFixed(3));
  done();
}

function captureAccessToken(requestParams, response, context, events, done) {
  try {
    const body = JSON.parse(response.body);
    const token = body?.data?.accessToken;
    if (token) {
      context.vars.accessToken = token;
    }
  } catch (_) {
    // ignore parse errors; Artillery will flag the 4xx/5xx status via metrics.
  }
  done();
}

function captureOrderId(requestParams, response, context, events, done) {
  try {
    const body = JSON.parse(response.body);
    const id = body?.data?.id ?? body?.id;
    if (id) {
      context.vars.orderId = id;
    }
  } catch (_) {
    /* ignore */
  }
  done();
}

// A lighter-weight auth path for the admin — we cache the token for the
// whole run because admin login does a bcrypt.compare which is expensive and
// would dominate the latency distribution otherwise.
async function ensureAdminToken(context, events, done) {
  if (tokenCache.has('admin')) {
    context.vars.accessToken = tokenCache.get('admin');
    return done();
  }
  try {
    const http = require('http');
    const data = JSON.stringify({ username: 'admin', password: 'admin' });
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3001,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            const token = JSON.parse(buf)?.data?.accessToken;
            if (token) {
              tokenCache.set('admin', token);
              context.vars.accessToken = token;
            }
          } catch (_) {
            /* ignore */
          }
          done();
        });
      },
    );
    req.on('error', () => done());
    req.write(data);
    req.end();
  } catch (_) {
    done();
  }
}

function randomInvoiceNumber() {
  return `LT-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

function setInvoiceNumber(context, events, done) {
  context.vars.invoiceNumber = randomInvoiceNumber();
  done();
}

module.exports = {
  setAdminCredentials,
  setManagerCredentials,
  setDriverCredentials,
  setRandomCustomer,
  captureAccessToken,
  captureOrderId,
  ensureAdminToken,
  setInvoiceNumber,
};
