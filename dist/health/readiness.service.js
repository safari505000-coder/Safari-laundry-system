"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadinessService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
const bullmq_1 = require("bullmq");
const discord_alert_queue_1 = require("../common/services/discord-alert.queue");
const prisma_service_1 = require("../prisma/prisma.service");
let ReadinessService = class ReadinessService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async check() {
        const checks = {
            database: false,
            redis: false,
            queue: false,
        };
        try {
            await this.prisma.$queryRaw `SELECT 1`;
            checks.database = true;
        }
        catch {
            checks.database = false;
        }
        const conn = (0, discord_alert_queue_1.discordRedisConnection)();
        if (!conn) {
            checks.redis = false;
            checks.queue = false;
        }
        else {
            const client = new ioredis_1.default({
                host: conn.host,
                port: conn.port,
                username: conn.username,
                password: conn.password,
                db: conn.db,
                tls: conn.tls,
                maxRetriesPerRequest: null,
                enableOfflineQueue: false,
                connectTimeout: 2_000,
                lazyConnect: false,
            });
            try {
                const pong = await client.ping();
                checks.redis = pong === 'PONG';
                const queue = new bullmq_1.Queue(discord_alert_queue_1.DISCORD_ALERT_QUEUE, { connection: conn });
                try {
                    await queue.getJobCounts('waiting', 'active');
                    checks.queue = checks.redis;
                }
                finally {
                    await queue.close().catch(() => undefined);
                }
            }
            catch {
                checks.redis = false;
                checks.queue = false;
            }
            finally {
                void client.quit().catch(() => undefined);
            }
        }
        const ok = checks.database && checks.redis && checks.queue;
        return {
            ok,
            checks,
            region: process.env.REGION ?? 'unknown',
            deploymentColor: process.env.DEPLOYMENT_COLOR ?? process.env.DEPLOYMENT_SLOT ?? 'blue',
        };
    }
};
exports.ReadinessService = ReadinessService;
exports.ReadinessService = ReadinessService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ReadinessService);
//# sourceMappingURL=readiness.service.js.map