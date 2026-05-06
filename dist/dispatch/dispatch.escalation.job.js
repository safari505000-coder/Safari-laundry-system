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
var DispatchEscalationJob_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DispatchEscalationJob = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const dispatch_service_1 = require("./dispatch.service");
let DispatchEscalationJob = DispatchEscalationJob_1 = class DispatchEscalationJob {
    dispatch;
    logger = new common_1.Logger(DispatchEscalationJob_1.name);
    isRunning = false;
    constructor(dispatch) {
        this.dispatch = dispatch;
    }
    async tick() {
        if (this.isRunning) {
            this.logger.debug('dispatch_sla_skipped reason=ALREADY_RUNNING');
            return;
        }
        this.isRunning = true;
        try {
            await this.runOnce();
        }
        finally {
            this.isRunning = false;
        }
    }
    async runOnce() {
        try {
            const result = await this.dispatch.runSlaMonitorOnce({});
            if (result.inspected > 0 && result.firstAlerts + result.escalations + result.breaches > 0) {
                this.logger.log(`dispatch_sla_tick inspected=${result.inspected} firstAlerts=${result.firstAlerts} escalations=${result.escalations} breaches=${result.breaches}`);
            }
            return result;
        }
        catch (error) {
            this.logger.error(`dispatch_sla_failed reason=${error instanceof Error ? error.message : String(error)}`);
            return {
                inspected: 0,
                firstAlerts: 0,
                escalations: 0,
                breaches: 0,
            };
        }
    }
};
exports.DispatchEscalationJob = DispatchEscalationJob;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_MINUTE, { name: 'dispatch.sla' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DispatchEscalationJob.prototype, "tick", null);
exports.DispatchEscalationJob = DispatchEscalationJob = DispatchEscalationJob_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [dispatch_service_1.DispatchService])
], DispatchEscalationJob);
//# sourceMappingURL=dispatch.escalation.job.js.map