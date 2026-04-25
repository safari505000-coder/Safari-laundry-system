"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertProductionJwtSecret = assertProductionJwtSecret;
const common_1 = require("@nestjs/common");
const jwt_secret_fallback_1 = require("../common/constants/jwt-secret-fallback");
function assertProductionJwtSecret() {
    if (process.env.NODE_ENV !== 'production') {
        return;
    }
    const s = process.env.JWT_SECRET?.trim();
    if (!s || s === jwt_secret_fallback_1.JWT_SECRET_DEV_FALLBACK) {
        common_1.Logger.error('Production: JWT_SECRET is missing or still the dev default. Invoice PDF (INVOICE_SHARE) verification will not match any token signed with another key; set JWT_SECRET in Render to one stable value (min ~32 random chars) and keep it across redeploys.', 'Bootstrap');
    }
    else if (s.length < 32) {
        common_1.Logger.warn('Production: JWT_SECRET is under 32 characters. Prefer a long random value so keys are not easily brute-forced.', 'Bootstrap');
    }
}
//# sourceMappingURL=assert-production-jwt-secret.js.map