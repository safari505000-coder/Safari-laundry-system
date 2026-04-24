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
exports.SerialLogDto = exports.SerialLogRowDto = exports.DriverPrefixRowDto = exports.SetDriverPrefixDto = void 0;
const class_validator_1 = require("class-validator");
class SetDriverPrefixDto {
    driverPrefix;
}
exports.SetDriverPrefixDto = SetDriverPrefixDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(1, 1),
    (0, class_validator_1.Matches)(/^[A-Z]$/, {
        message: 'driverPrefix must be a single uppercase letter A-Z',
    }),
    __metadata("design:type", Object)
], SetDriverPrefixDto.prototype, "driverPrefix", void 0);
class DriverPrefixRowDto {
    id;
    fullName;
    username;
    driverPrefix;
    branchName;
    isActive;
    safariRole;
}
exports.DriverPrefixRowDto = DriverPrefixRowDto;
class SerialLogRowDto {
    orderId;
    serialNumber;
    driverId;
    driverName;
    driverPrefix;
    customerName;
    totalPriceKd;
    createdAtIso;
}
exports.SerialLogRowDto = SerialLogRowDto;
class SerialLogDto {
    currentCounter;
    rows;
}
exports.SerialLogDto = SerialLogDto;
//# sourceMappingURL=serials.dto.js.map