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
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueAdminController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const replay_queue_dto_1 = require("./dto/replay-queue.dto");
const queue_admin_service_1 = require("./queue-admin.service");
const audit_logs_service_1 = require("../audit-logs/audit-logs.service");
let QueueAdminController = class QueueAdminController {
    queues;
    auditLogs;
    constructor(queues, auditLogs) {
        this.queues = queues;
        this.auditLogs = auditLogs;
    }
    replay(dto) {
        return this.queues.replay(dto.queue, dto.limit ?? 25);
    }
    metrics() {
        return this.queues.metrics();
    }
    dlq(queue, limit) {
        return this.queues.listDlq(queue, Number.parseInt(limit ?? '50', 10) || 50);
    }
    replayOne(jobId, dto) {
        return this.queues.replayJob(dto.queue, jobId);
    }
    replayAll(dto) {
        return this.queues.replay(dto.queue, dto.limit ?? 25);
    }
    verifyAudit() {
        return this.auditLogs.verifyAuditIntegrity();
    }
};
exports.QueueAdminController = QueueAdminController;
__decorate([
    (0, common_1.Post)('admin/queues/replay'),
    (0, swagger_1.ApiOperation)({ summary: 'Replay failed BullMQ DLQ jobs' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [replay_queue_dto_1.ReplayQueueDto]),
    __metadata("design:returntype", void 0)
], QueueAdminController.prototype, "replay", null);
__decorate([
    (0, common_1.Get)('metrics/queues'),
    (0, swagger_1.ApiOperation)({ summary: 'Queue metrics and circuit breaker states' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], QueueAdminController.prototype, "metrics", null);
__decorate([
    (0, common_1.Get)('admin/queues/dlq'),
    (0, swagger_1.ApiOperation)({ summary: 'List failed DLQ jobs' }),
    __param(0, (0, common_1.Query)('queue')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], QueueAdminController.prototype, "dlq", null);
__decorate([
    (0, common_1.Post)('admin/queues/replay/:jobId'),
    (0, swagger_1.ApiOperation)({ summary: 'Replay one failed DLQ job' }),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, replay_queue_dto_1.ReplayQueueDto]),
    __metadata("design:returntype", void 0)
], QueueAdminController.prototype, "replayOne", null);
__decorate([
    (0, common_1.Post)('admin/queues/replay-all'),
    (0, swagger_1.ApiOperation)({ summary: 'Replay failed DLQ jobs with rate limiting' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [replay_queue_dto_1.ReplayQueueDto]),
    __metadata("design:returntype", void 0)
], QueueAdminController.prototype, "replayAll", null);
__decorate([
    (0, common_1.Get)('admin/audit/verify'),
    (0, swagger_1.ApiOperation)({ summary: 'Verify immutable audit hash chain' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], QueueAdminController.prototype, "verifyAudit", null);
exports.QueueAdminController = QueueAdminController = __decorate([
    (0, swagger_1.ApiTags)('queue-admin'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    __metadata("design:paramtypes", [queue_admin_service_1.QueueAdminService,
        audit_logs_service_1.AuditLogsService])
], QueueAdminController);
//# sourceMappingURL=queue-admin.controller.js.map