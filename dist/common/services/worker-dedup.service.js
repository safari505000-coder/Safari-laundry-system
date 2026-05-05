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
var WorkerDedupService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkerDedupService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
let WorkerDedupService = WorkerDedupService_1 = class WorkerDedupService {
    logger = new common_1.Logger(WorkerDedupService_1.name);
    redis = null;
    ttlSec = Number.parseInt(process.env.WORKER_DEDUP_TTL_SEC ?? '604800', 10) || 604_800;
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
    async claimWorkerSideEffect(queue, jobId, meta) {
        const client = this.redis;
        if (!client) {
            return true;
        }
        const key = `worker:idem:${queue}:${jobId}`;
        try {
            const r = await client.set(key, '1', 'EX', this.ttlSec, 'NX');
            if (r !== 'OK') {
                this.logger.warn(JSON.stringify({
                    event: 'worker_dedup_skip',
                    traceId: meta?.traceId,
                    orderId: meta?.orderId,
                    queue,
                    jobId: jobId.slice(0, 24),
                }));
                return false;
            }
            return true;
        }
        catch {
            return true;
        }
    }
    async releaseWorkerSideEffect(queue, jobId) {
        const client = this.redis;
        if (!client) {
            return;
        }
        const key = `worker:idem:${queue}:${jobId}`;
        try {
            await client.del(key);
        }
        catch {
        }
    }
};
exports.WorkerDedupService = WorkerDedupService;
exports.WorkerDedupService = WorkerDedupService = WorkerDedupService_1 = __decorate([
    (0, common_1.Injectable)()
], WorkerDedupService);
//# sourceMappingURL=worker-dedup.service.js.map