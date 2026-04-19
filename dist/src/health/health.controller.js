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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const terminus_1 = require("@nestjs/terminus");
const swagger_1 = require("@nestjs/swagger");
const branding_1 = require("../common/constants/branding");
const prisma_health_1 = require("./prisma.health");
let HealthController = class HealthController {
    health;
    prismaHealth;
    memory;
    heapLimitBytes;
    rssLimitBytes;
    constructor(health, prismaHealth, memory) {
        this.health = health;
        this.prismaHealth = prismaHealth;
        this.memory = memory;
        this.heapLimitBytes =
            Number.parseInt(process.env.HEALTH_HEAP_LIMIT_MB ?? '300', 10) *
                1024 *
                1024;
        this.rssLimitBytes =
            Number.parseInt(process.env.HEALTH_RSS_LIMIT_MB ?? '500', 10) *
                1024 *
                1024;
    }
    check() {
        return this.health.check([
            () => this.prismaHealth.pingCheck('database'),
            () => this.memory.checkHeap('memory_heap', this.heapLimitBytes),
            () => this.memory.checkRSS('memory_rss', this.rssLimitBytes),
        ]);
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, common_1.Get)(),
    (0, terminus_1.HealthCheck)(),
    (0, swagger_1.ApiOperation)({ summary: `Liveness probe (${branding_1.APP_BRAND})` }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "check", null);
exports.HealthController = HealthController = __decorate([
    (0, swagger_1.ApiTags)('health'),
    (0, common_1.Controller)('health'),
    __metadata("design:paramtypes", [terminus_1.HealthCheckService,
        prisma_health_1.PrismaHealthIndicator,
        terminus_1.MemoryHealthIndicator])
], HealthController);
//# sourceMappingURL=health.controller.js.map