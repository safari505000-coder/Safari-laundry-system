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
exports.SystemVerifyResponseDto = exports.SystemVerifyCheckDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class SystemVerifyCheckDto {
    scenario;
    expected;
    classified;
    risk;
    executive;
    financialAlerts;
    complianceAlerts;
    ok;
}
exports.SystemVerifyCheckDto = SystemVerifyCheckDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Human label for the simulated scenario.' }),
    __metadata("design:type", String)
], SystemVerifyCheckDto.prototype, "scenario", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Expected systemStatus for this scenario, encoded with the traffic-light vocabulary the platform uses (GREEN / YELLOW / RED).',
    }),
    __metadata("design:type", String)
], SystemVerifyCheckDto.prototype, "expected", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Status returned by the classifier for this scenario (single source of truth).',
    }),
    __metadata("design:type", String)
], SystemVerifyCheckDto.prototype, "classified", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Status returned by /risk for this scenario. Must equal `classified` per the SSoT contract.',
    }),
    __metadata("design:type", String)
], SystemVerifyCheckDto.prototype, "risk", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Status returned by /executive for this scenario. Must equal `classified` per the SSoT contract.',
    }),
    __metadata("design:type", String)
], SystemVerifyCheckDto.prototype, "executive", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'How many financial alerts the classifier emitted for this scenario.',
    }),
    __metadata("design:type", Number)
], SystemVerifyCheckDto.prototype, "financialAlerts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'How many compliance alerts the classifier emitted for this scenario.',
    }),
    __metadata("design:type", Number)
], SystemVerifyCheckDto.prototype, "complianceAlerts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Per-scenario PASS/FAIL — true when every check above held.',
    }),
    __metadata("design:type", Boolean)
], SystemVerifyCheckDto.prototype, "ok", void 0);
class SystemVerifyResponseDto {
    status;
    blocked;
    checks;
    mismatches;
    generatedAt;
    readOnly;
}
exports.SystemVerifyResponseDto = SystemVerifyResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['PASS', 'FAIL'] }),
    __metadata("design:type", String)
], SystemVerifyResponseDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'True when at least one check failed. Operators should treat the system as unsafe to ship until this is `false`.',
    }),
    __metadata("design:type", Boolean)
], SystemVerifyResponseDto.prototype, "blocked", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [SystemVerifyCheckDto] }),
    __metadata("design:type", Array)
], SystemVerifyResponseDto.prototype, "checks", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: [String],
        description: 'Human-readable summary of every contract violation. Empty on PASS.',
    }),
    __metadata("design:type", Array)
], SystemVerifyResponseDto.prototype, "mismatches", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ISO timestamp the verification ran at.' }),
    __metadata("design:type", String)
], SystemVerifyResponseDto.prototype, "generatedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Always true — the verification path never writes data.',
    }),
    __metadata("design:type", Boolean)
], SystemVerifyResponseDto.prototype, "readOnly", void 0);
//# sourceMappingURL=system-verify.dto.js.map