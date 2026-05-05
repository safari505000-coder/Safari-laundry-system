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
var SecurityStateService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityStateService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
let SecurityStateService = SecurityStateService_1 = class SecurityStateService {
    logger = new common_1.Logger(SecurityStateService_1.name);
    redis = null;
    onModuleInit() {
        const url = process.env.REDIS_URL ??
            process.env.BULLMQ_REDIS_URL ??
            process.env.REDIS_PUBLIC_URL ??
            '';
        if (!url.trim()) {
            this.logger.warn('security_redis_unavailable');
            return;
        }
        this.redis = new ioredis_1.default(url, {
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            lazyConnect: true,
        });
        void this.redis.connect().catch(() => {
            this.redis = null;
            this.logger.warn('security_redis_connect_failed');
        });
    }
    onModuleDestroy() {
        void this.redis?.quit().catch(() => undefined);
        this.redis = null;
    }
    async isBlocked(keys) {
        const client = this.redis;
        if (!client) {
            return false;
        }
        const now = Date.now();
        for (const key of keys) {
            const value = await client.get(this.key('block', key));
            if (value && Number(value) > now) {
                return true;
            }
        }
        return false;
    }
    async block(keys, until) {
        const client = this.redis;
        if (!client) {
            return;
        }
        const ttlMs = Math.max(1_000, until - Date.now());
        const pipeline = client.pipeline();
        for (const key of keys) {
            pipeline.set(this.key('block', key), String(until), 'PX', ttlMs);
        }
        await pipeline.exec();
    }
    async incrementWindow(key, ttlSeconds) {
        const client = this.redis;
        if (!client) {
            return 1;
        }
        const redisKey = this.key('rate', key);
        const count = await client.incr(redisKey);
        if (count === 1) {
            await client.expire(redisKey, ttlSeconds);
        }
        return count;
    }
    async addForbiddenAttempt(actorKey, endpoint, windowMs) {
        const client = this.redis;
        const now = Date.now();
        if (!client) {
            return [{ at: now, endpoint }];
        }
        const redisKey = this.key('forbidden', actorKey);
        const member = JSON.stringify({
            at: now,
            endpoint,
            nonce: Math.random().toString(36).slice(2),
        });
        const min = now - windowMs;
        const pipeline = client.pipeline();
        pipeline.zadd(redisKey, now, member);
        pipeline.zremrangebyscore(redisKey, 0, min);
        pipeline.expire(redisKey, Math.ceil(windowMs / 1_000));
        await pipeline.exec();
        const rows = await client.zrange(redisKey, 0, -1);
        return rows
            .map((row) => this.parseAttempt(row))
            .filter((row) => Boolean(row));
    }
    async forbiddenAttempts(actorKey, windowMs) {
        const client = this.redis;
        if (!client) {
            return [];
        }
        const redisKey = this.key('forbidden', actorKey);
        const now = Date.now();
        await client.zremrangebyscore(redisKey, 0, now - windowMs);
        const rows = await client.zrange(redisKey, 0, -1);
        return rows
            .map((row) => this.parseAttempt(row))
            .filter((row) => Boolean(row));
    }
    async acquireCooldown(key, ttlMs) {
        const client = this.redis;
        if (!client) {
            return true;
        }
        const result = await client.set(this.key('cooldown', key), '1', 'PX', ttlMs, 'NX');
        return result === 'OK';
    }
    parseAttempt(row) {
        try {
            const value = JSON.parse(row);
            return typeof value.endpoint === 'string' && typeof value.at === 'number' ?
                { at: value.at, endpoint: value.endpoint }
                : null;
        }
        catch {
            return null;
        }
    }
    key(scope, value) {
        return `security:${scope}:${value}`;
    }
};
exports.SecurityStateService = SecurityStateService;
exports.SecurityStateService = SecurityStateService = SecurityStateService_1 = __decorate([
    (0, common_1.Injectable)()
], SecurityStateService);
//# sourceMappingURL=security-state.service.js.map