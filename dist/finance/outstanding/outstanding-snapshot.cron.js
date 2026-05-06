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
var OutstandingSnapshotCron_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutstandingSnapshotCron = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const outstanding_service_1 = require("./outstanding.service");
let OutstandingSnapshotCron = OutstandingSnapshotCron_1 = class OutstandingSnapshotCron {
    outstanding;
    logger = new common_1.Logger(OutstandingSnapshotCron_1.name);
    isRunning = false;
    lastResult = null;
    constructor(outstanding) {
        this.outstanding = outstanding;
    }
    async tick() {
        if (this.isRunning) {
            this.logger.debug('outstanding_snapshot_skipped reason=ALREADY_RUNNING');
            return;
        }
        this.isRunning = true;
        try {
            this.lastResult = await this.runOnce();
        }
        finally {
            this.isRunning = false;
        }
    }
    async runOnce() {
        try {
            const data = await this.outstanding.listOutstanding({});
            const result = {
                ranAtIso: new Date().toISOString(),
                fromIso: data.fromIso,
                toIso: data.toIso,
                totalCustomers: data.totalCustomers,
                totalInvoices: data.totalInvoices,
                totalDueKd: data.totalDueKd,
                blockedCount: data.blockedCount,
                lateCount: data.lateCount,
                riskCount: data.riskCount,
            };
            this.logger.log(`outstanding_snapshot customers=${result.totalCustomers} invoices=${result.totalInvoices} dueKd=${result.totalDueKd} blocked=${result.blockedCount} late=${result.lateCount} risk=${result.riskCount}`);
            return result;
        }
        catch (error) {
            this.logger.error(`outstanding_snapshot_failed reason=${error instanceof Error ? error.message : String(error)}`);
            return {
                ranAtIso: new Date().toISOString(),
                fromIso: '',
                toIso: '',
                totalCustomers: 0,
                totalInvoices: 0,
                totalDueKd: '0.000',
                blockedCount: 0,
                lateCount: 0,
                riskCount: 0,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    getLastResult() {
        return this.lastResult;
    }
};
exports.OutstandingSnapshotCron = OutstandingSnapshotCron;
__decorate([
    (0, schedule_1.Cron)('0 6 * * *', {
        name: 'finance.outstanding.snapshot',
        timeZone: 'UTC',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OutstandingSnapshotCron.prototype, "tick", null);
exports.OutstandingSnapshotCron = OutstandingSnapshotCron = OutstandingSnapshotCron_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [outstanding_service_1.OutstandingService])
], OutstandingSnapshotCron);
//# sourceMappingURL=outstanding-snapshot.cron.js.map