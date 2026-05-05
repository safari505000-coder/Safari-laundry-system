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
var FinanceDashboardCacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinanceDashboardCacheService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
const PREFIX = 'finance:acct-dash:';
const TTL_SEC = Number.parseInt(process.env.FINANCE_DASHBOARD_CACHE_TTL_SEC ?? '45', 10) || 45;
let FinanceDashboardCacheService = FinanceDashboardCacheService_1 = class FinanceDashboardCacheService {
    logger = new common_1.Logger(FinanceDashboardCacheService_1.name);
    redis = null;
    memory = new Map();
    onModuleInit() {
        const raw = process.env.REDIS_URL ??
            process.env.BULLMQ_REDIS_URL ??
            process.env.REDIS_PUBLIC_URL ??
            '';
        if (!raw.trim()) {
            return;
        }
        this.redis = new ioredis_1.default(raw, {
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
    async get(key) {
        const client = this.redis;
        if (client) {
            try {
                const v = await client.get(PREFIX + key);
                if (v)
                    return v;
            }
            catch {
                this.logger.warn('finance_dash_cache_redis_read_failed');
            }
        }
        const m = this.memory.get(key);
        if (!m || m.exp < Date.now()) {
            if (m)
                this.memory.delete(key);
            return null;
        }
        return m.raw;
    }
    async set(key, json) {
        const client = this.redis;
        if (client) {
            try {
                await client.set(PREFIX + key, json, 'EX', TTL_SEC);
                return;
            }
            catch {
                this.logger.warn('finance_dash_cache_redis_write_failed');
            }
        }
        this.memory.set(key, { raw: json, exp: Date.now() + TTL_SEC * 1000 });
    }
    cacheKey(segment, parts) {
        const flat = Object.entries(parts)
            .filter(([, v]) => v !== undefined && v !== '')
            .map(([k, v]) => `${k}=${v}`)
            .sort()
            .join('|');
        return `${segment}:${flat}`;
    }
    async wrapJson(key, compute) {
        const hit = await this.get(key);
        if (hit) {
            try {
                return JSON.parse(hit);
            }
            catch {
            }
        }
        const next = await compute();
        void this.set(key, JSON.stringify(next)).catch(() => undefined);
        return next;
    }
    clearMemoryCacheForTests() {
        this.memory.clear();
    }
};
exports.FinanceDashboardCacheService = FinanceDashboardCacheService;
exports.FinanceDashboardCacheService = FinanceDashboardCacheService = FinanceDashboardCacheService_1 = __decorate([
    (0, common_1.Injectable)()
], FinanceDashboardCacheService);
//# sourceMappingURL=finance-dashboard-cache.service.js.map