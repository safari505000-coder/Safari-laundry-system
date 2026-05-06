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
exports.DispatchMonitorSnapshotDto = exports.DispatchMonitorDriverDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const dispatch_row_dto_1 = require("./dispatch-row.dto");
class DispatchMonitorDriverDto {
    driverId;
    driverName;
    activeAssignedCount;
    lateCount;
    breachCount;
    assignedTasks;
}
exports.DispatchMonitorDriverDto = DispatchMonitorDriverDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DispatchMonitorDriverDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DispatchMonitorDriverDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ASSIGNED dispatches currently open for this driver.' }),
    __metadata("design:type", Number)
], DispatchMonitorDriverDto.prototype, "activeAssignedCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], DispatchMonitorDriverDto.prototype, "lateCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], DispatchMonitorDriverDto.prototype, "breachCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => [dispatch_row_dto_1.DispatchRowDto] }),
    __metadata("design:type", Array)
], DispatchMonitorDriverDto.prototype, "assignedTasks", void 0);
class DispatchMonitorSnapshotDto {
    generatedAtIso;
    drivers;
    delayedDriversSection;
}
exports.DispatchMonitorSnapshotDto = DispatchMonitorSnapshotDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DispatchMonitorSnapshotDto.prototype, "generatedAtIso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => [DispatchMonitorDriverDto] }),
    __metadata("design:type", Array)
], DispatchMonitorSnapshotDto.prototype, "drivers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: () => [dispatch_row_dto_1.DispatchRowDto],
        description: 'ASSIGNED dispatches past the first SLA threshold — operations “delayed drivers” strip.',
    }),
    __metadata("design:type", Array)
], DispatchMonitorSnapshotDto.prototype, "delayedDriversSection", void 0);
//# sourceMappingURL=dispatch-monitor.dto.js.map