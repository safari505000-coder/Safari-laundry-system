"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fs = __importStar(require("fs"));
const http = __importStar(require("http"));
const BASE = 'http://localhost:3001';
const STAGE = process.argv[2] ?? 'ad-hoc';
function req(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : undefined;
        const r = http.request({
            hostname: 'localhost',
            port: 3001,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            timeout: 15000,
        }, (res) => {
            let buf = '';
            res.on('data', (c) => (buf += c));
            res.on('end', () => {
                try {
                    resolve(buf ? JSON.parse(buf) : {});
                }
                catch (err) {
                    reject(new Error(`parse fail: ${path}: ${String(err)}; raw=${buf.slice(0, 200)}`));
                }
            });
        });
        r.on('error', reject);
        r.on('timeout', () => r.destroy(new Error('timeout')));
        if (data)
            r.write(data);
        r.end();
    });
}
async function main() {
    const login = await req('POST', '/api/auth/login', { username: 'admin', password: 'admin' });
    const token = login.data.accessToken;
    const [issuer, unpaid, ops] = await Promise.all([
        req('GET', '/api/finance/reports/open-debt-by-issuer', undefined, token),
        req('GET', '/api/finance/reports/unpaid-invoices', undefined, token),
        req('GET', '/api/call-center/operations-summary?windowHours=24', undefined, token),
    ]);
    const issuerRows = issuer?.data?.rows ?? [];
    const issuerSum = issuerRows.reduce((s, r) => s + Number(r.openDebtKd || 0), 0);
    const unpaidOpen = Number(unpaid?.data?.kpis?.openDebtKd ?? unpaid?.data?.openDebtKd ?? 0);
    const collectionsTotal = Number(ops?.data?.collections?.totalMarketDebtKd ??
        ops?.data?.totalMarketDebtKd ??
        0);
    const maxDelta = Math.max(Math.abs(issuerSum - unpaidOpen), Math.abs(issuerSum - collectionsTotal), Math.abs(unpaidOpen - collectionsTotal));
    const status = maxDelta < 0.001 ? 'MATCH' : 'DRIFT';
    const record = {
        stage: STAGE,
        at: new Date().toISOString(),
        status,
        issuerSumKd: issuerSum,
        unpaidInvoicesOpenKd: unpaidOpen,
        collectionsTotalKd: collectionsTotal,
        maxDeltaKd: maxDelta,
        issuerRows,
    };
    fs.appendFileSync('load-test/reports/reconciliation.jsonl', JSON.stringify(record) + '\n');
    console.log(`[reconcile ${STAGE}] ${status}  issuer=${issuerSum.toFixed(3)} ` +
        `unpaid=${unpaidOpen.toFixed(3)} collections=${collectionsTotal.toFixed(3)} ` +
        `Δ=${maxDelta.toFixed(4)} KWD`);
    if (status !== 'MATCH')
        process.exitCode = 2;
}
main().catch((err) => {
    console.error('[reconcile] failed:', err);
    process.exit(1);
});
//# sourceMappingURL=reconcile.js.map