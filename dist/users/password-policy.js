"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.passwordMinLength = passwordMinLength;
exports.assertPasswordStrength = assertPasswordStrength;
const common_1 = require("@nestjs/common");
const DEFAULT_MIN = 6;
function passwordMinLength() {
    const raw = process.env.PASSWORD_MIN_LENGTH ?? '';
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 4 ? n : DEFAULT_MIN;
}
function assertPasswordStrength(plain) {
    const min = passwordMinLength();
    if (typeof plain !== 'string' || plain.length < min) {
        throw new common_1.BadRequestException(`Password must be at least ${min} characters.`);
    }
}
//# sourceMappingURL=password-policy.js.map