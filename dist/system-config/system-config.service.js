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
var SystemConfigService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemConfigService = exports.SYSTEM_CONFIG_ID = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const kuwait_customer_phone_1 = require("../common/validation/kuwait-customer-phone");
exports.SYSTEM_CONFIG_ID = 'GLOBAL';
let SystemConfigService = SystemConfigService_1 = class SystemConfigService {
    prisma;
    logger = new common_1.Logger(SystemConfigService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getGuardianPhone() {
        const row = await this.prisma.systemConfig.findUnique({
            where: { id: exports.SYSTEM_CONFIG_ID },
            select: { guardianPhone: true },
        });
        const raw = row?.guardianPhone ?? null;
        if (!raw)
            return null;
        const normalised = (0, kuwait_customer_phone_1.parseKuwaitMobile965)(raw);
        if (!normalised) {
            this.logger.warn(`system_config_invalid_phone: stored value rejected by validator (${maskForLog(raw)})`);
            return null;
        }
        return normalised;
    }
    async resolveGuardianPhone() {
        const fromDb = await this.getGuardianPhone();
        if (fromDb)
            return { phone: fromDb, source: 'database' };
        const envRaw = process.env.SYSTEM_GUARDIAN_OWNER_PHONE?.trim();
        const envDigits = envRaw ? (0, kuwait_customer_phone_1.parseKuwaitMobile965)(envRaw) : null;
        if (envDigits)
            return { phone: envDigits, source: 'env' };
        return { phone: null, source: 'none' };
    }
    async getPublicConfig() {
        const row = await this.prisma.systemConfig.findUnique({
            where: { id: exports.SYSTEM_CONFIG_ID },
            select: { guardianPhone: true, updatedAt: true },
        });
        const stored = row?.guardianPhone
            ? ((0, kuwait_customer_phone_1.parseKuwaitMobile965)(row.guardianPhone) ?? row.guardianPhone)
            : null;
        const resolved = await this.resolveGuardianPhone();
        return {
            guardianPhone: stored,
            resolved,
            updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
        };
    }
    async setGuardianPhone(input) {
        let normalised = null;
        if (input !== null && input !== undefined) {
            const trimmed = String(input).trim();
            if (trimmed.length > 0) {
                const parsed = (0, kuwait_customer_phone_1.parseKuwaitMobile965)(trimmed);
                if (!parsed) {
                    throw new common_1.BadRequestException('guardianPhone must be a valid Kuwait mobile (965 + 8 digits starting with 5/6/9, e.g. 96591234567).');
                }
                normalised = parsed;
            }
        }
        const row = await this.prisma.systemConfig.upsert({
            where: { id: exports.SYSTEM_CONFIG_ID },
            create: { id: exports.SYSTEM_CONFIG_ID, guardianPhone: normalised },
            update: { guardianPhone: normalised },
            select: { guardianPhone: true, updatedAt: true },
        });
        return {
            guardianPhone: row.guardianPhone,
            updatedAt: row.updatedAt.toISOString(),
        };
    }
};
exports.SystemConfigService = SystemConfigService;
exports.SystemConfigService = SystemConfigService = SystemConfigService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SystemConfigService);
function maskForLog(s) {
    const compact = s.replace(/\s+/g, '');
    if (compact.length < 6)
        return '***';
    return `${compact.slice(0, 3)}****${compact.slice(-4)}`;
}
//# sourceMappingURL=system-config.service.js.map