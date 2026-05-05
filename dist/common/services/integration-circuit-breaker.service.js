"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var IntegrationCircuitBreakerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationCircuitBreakerService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
const FAILURE_THRESHOLD = 5;
const parsedOpenMs = Number.parseInt(process.env.INTEGRATION_CIRCUIT_OPEN_MS ?? '30000', 10);
const OPEN_MS = Number.isFinite(parsedOpenMs) && parsedOpenMs > 0 ? parsedOpenMs : 30_000;
let IntegrationCircuitBreakerService = IntegrationCircuitBreakerService_1 = class IntegrationCircuitBreakerService {
    logger = new common_1.Logger(IntegrationCircuitBreakerService_1.name);
    redis = null;
    onModuleInit() {
        const url = process.env.REDIS_URL ??
            process.env.BULLMQ_REDIS_URL ??
            process.env.REDIS_PUBLIC_URL ??
            '';
        if (!url.trim()) {
            return;
        }
        this.redis = new ioredis_1.default(url, {
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            lazyConnect: true,
        });
        void this.redis.connect().catch(() => {
            this.redis = null;
        });
    }
    onModuleDestroy() {
        void this.redis?.quit().catch(() => undefined);
        this.redis = null;
    }
    async beforeRequest(name) {
        const record = await this.read(name);
        if (record.state === 'OPEN' && record.openedUntil > Date.now()) {
            return 'OPEN';
        }
        if (record.state === 'OPEN') {
            await this.write(name, { ...record, state: 'HALF_OPEN' });
            return 'HALF_OPEN';
        }
        return record.state;
    }
    async recordSuccess(name) {
        const record = await this.read(name);
        await this.write(name, {
            state: 'CLOSED',
            failures: 0,
            total: record.total + 1,
            windowStartedAt: record.windowStartedAt,
            openedUntil: 0,
            openedAt: 0,
        });
    }
    async recordFailure(name) {
        let record = await this.read(name);
        if (Date.now() - record.windowStartedAt > 60_000) {
            record = {
                state: record.state,
                failures: 0,
                total: 0,
                windowStartedAt: Date.now(),
                openedUntil: record.openedUntil,
                openedAt: record.openedAt,
            };
        }
        const failures = record.failures + 1;
        const total = record.total + 1;
        const failureRate = total > 0 ? failures / total : 0;
        if (record.state === 'HALF_OPEN' ||
            failures >= FAILURE_THRESHOLD ||
            (total >= 10 && failureRate >= 0.5)) {
            const openedUntil = Date.now() + OPEN_MS;
            const openedAt = Date.now();
            await this.write(name, {
                state: 'OPEN',
                failures,
                total,
                windowStartedAt: record.windowStartedAt,
                openedUntil,
                openedAt,
            });
            this.logger.warn(`circuit_opened integration=${name}`);
            return 'OPEN';
        }
        await this.write(name, { ...record, failures, total });
        return record.state;
    }
    async state(name) {
        return this.read(name);
    }
    async read(name) {
        const client = this.redis;
        if (!client) {
            return this.closedRecord();
        }
        const raw = await client.get(this.key(name));
        if (!raw) {
            return this.closedRecord();
        }
        try {
            const parsed = JSON.parse(raw);
            return {
                state: parsed.state === 'OPEN' || parsed.state === 'HALF_OPEN' ?
                    parsed.state
                    : 'CLOSED',
                failures: Number.isFinite(parsed.failures) ? Number(parsed.failures) : 0,
                total: Number.isFinite(parsed.total) ? Number(parsed.total) : 0,
                windowStartedAt: Number.isFinite(parsed.windowStartedAt) ?
                    Number(parsed.windowStartedAt)
                    : Date.now(),
                openedUntil: Number.isFinite(parsed.openedUntil) ? Number(parsed.openedUntil) : 0,
                openedAt: Number.isFinite(parsed.openedAt) ? Number(parsed.openedAt) : 0,
            };
        }
        catch {
            return this.closedRecord();
        }
    }
    async write(name, record) {
        const client = this.redis;
        if (!client) {
            return;
        }
        await client.set(this.key(name), JSON.stringify(record), 'PX', 24 * 60 * 60 * 1_000);
    }
    closedRecord() {
        return {
            state: 'CLOSED',
            failures: 0,
            total: 0,
            windowStartedAt: Date.now(),
            openedUntil: 0,
            openedAt: 0,
        };
    }
    key(name) {
        return `circuit:${name}`;
    }
};
exports.IntegrationCircuitBreakerService = IntegrationCircuitBreakerService;
exports.IntegrationCircuitBreakerService = IntegrationCircuitBreakerService = IntegrationCircuitBreakerService_1 = __decorate([
    (0, common_1.Injectable)()
], IntegrationCircuitBreakerService);
//# sourceMappingURL=integration-circuit-breaker.service.js.map