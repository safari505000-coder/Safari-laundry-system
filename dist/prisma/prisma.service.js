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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PrismaService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaService = void 0;
exports.guardAppendOnlyDelegate = guardAppendOnlyDelegate;
const common_1 = require("@nestjs/common");
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("@prisma/client");
const pg_1 = require("pg");
const metrics_service_1 = require("../observability/metrics.service");
const APPEND_ONLY_FORBIDDEN = [
    'update',
    'updateMany',
    'delete',
    'deleteMany',
    'upsert',
];
function guardAppendOnlyDelegate(delegate, label) {
    return new Proxy(delegate, {
        get(target, prop) {
            if (typeof prop === 'string' &&
                APPEND_ONLY_FORBIDDEN.includes(prop)) {
                return () => {
                    throw new common_1.ForbiddenException(`${label} is append-only — \`${prop}\` is not allowed`);
                };
            }
            const value = Reflect.get(target, prop, target);
            if (typeof value === 'function') {
                return value.bind(target);
            }
            return value;
        },
    });
}
let PrismaService = class PrismaService extends client_1.PrismaClient {
    static { PrismaService_1 = this; }
    metrics;
    pool;
    static logger = new common_1.Logger(PrismaService_1.name);
    constructor(metrics) {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString?.trim()) {
            throw new Error('DATABASE_URL is not set');
        }
        const pool = new pg_1.Pool({ connectionString });
        const options = {
            adapter: new adapter_pg_1.PrismaPg(pool),
            log: [{ emit: 'event', level: 'query' }],
        };
        super(options);
        this.metrics = metrics;
        this.pool = pool;
        const prismaQueryEmitter = this;
        prismaQueryEmitter.$on('query', (e) => {
            this.metrics?.dbQueryDuration.observe(e.duration);
        });
        PrismaService_1.logger.log('DebtLedgerEntry append-only enforcement = DB trigger only (app-layer Proxy disabled for Prisma 7 compatibility)');
        const auditDelegate = this.auditLog;
        this.auditLog =
            guardAppendOnlyDelegate(auditDelegate, 'AuditLog');
    }
    async onModuleInit() {
        await this.$connect();
    }
    async onModuleDestroy() {
        await this.$disconnect();
        await this.pool.end();
    }
    async timedQuery(fn) {
        const started = performance.now();
        try {
            return await fn();
        }
        finally {
            this.metrics?.dbQueryDuration.observe(performance.now() - started);
        }
    }
};
exports.PrismaService = PrismaService;
exports.PrismaService = PrismaService = PrismaService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [metrics_service_1.MetricsService])
], PrismaService);
//# sourceMappingURL=prisma.service.js.map