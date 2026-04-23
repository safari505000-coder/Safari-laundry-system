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
var LowStockCronService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LowStockCronService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const kuwait_time_1 = require("../common/time/kuwait-time");
const prisma_service_1 = require("../prisma/prisma.service");
const inventory_service_1 = require("./inventory.service");
const AUDIT_RESOURCE = '/inventory/low-stock';
const AUDIT_ACTION_ALERT = 'INVENTORY_LOW_STOCK_DETECTED';
const AUDIT_ACTION_CLEAN = 'INVENTORY_LOW_STOCK_CLEAN';
let LowStockCronService = LowStockCronService_1 = class LowStockCronService {
    prisma;
    inventory;
    logger = new common_1.Logger(LowStockCronService_1.name);
    constructor(prisma, inventory) {
        this.prisma = prisma;
        this.inventory = inventory;
    }
    async handleCron() {
        try {
            const report = await this.inventory.lowStock();
            await this.prisma.auditLog.create({
                data: {
                    action: report.summary.total > 0
                        ? AUDIT_ACTION_ALERT
                        : AUDIT_ACTION_CLEAN,
                    resource: AUDIT_RESOURCE,
                    changes: report,
                },
            });
            if (report.summary.total > 0) {
                this.logger.warn(`[LOW-STOCK] ${report.summary.outOfStock} out-of-stock, ${report.summary.lowStock} low-stock SKU-branches.`);
            }
        }
        catch (err) {
            this.logger.error(`[LOW-STOCK] daily scan failed: ${String(err)}`);
        }
    }
    async latestSnapshot() {
        const row = await this.prisma.auditLog.findFirst({
            where: {
                resource: AUDIT_RESOURCE,
                action: { in: [AUDIT_ACTION_ALERT, AUDIT_ACTION_CLEAN] },
            },
            orderBy: { createdAt: 'desc' },
            select: { action: true, changes: true, createdAt: true },
        });
        if (!row)
            return null;
        const payload = row.changes;
        if (!payload || typeof payload !== 'object')
            return null;
        return {
            hadAlerts: row.action === AUDIT_ACTION_ALERT,
            recordedAtIso: row.createdAt.toISOString(),
            report: payload,
        };
    }
};
exports.LowStockCronService = LowStockCronService;
__decorate([
    (0, schedule_1.Cron)('0 6 * * *', { timeZone: kuwait_time_1.KUWAIT_TIMEZONE }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], LowStockCronService.prototype, "handleCron", null);
exports.LowStockCronService = LowStockCronService = LowStockCronService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        inventory_service_1.InventoryService])
], LowStockCronService);
//# sourceMappingURL=low-stock-cron.service.js.map