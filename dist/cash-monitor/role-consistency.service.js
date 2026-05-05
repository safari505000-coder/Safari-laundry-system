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
var RoleConsistencyService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoleConsistencyService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let RoleConsistencyService = RoleConsistencyService_1 = class RoleConsistencyService {
    prisma;
    logger = new common_1.Logger(RoleConsistencyService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async run() {
        const users = await this.prisma.user.findMany({
            where: { isActive: true },
            select: {
                id: true,
                username: true,
                fullName: true,
                safariRole: true,
                branchId: true,
                isActive: true,
                role: { select: { name: true } },
            },
        });
        const mismatches = [];
        for (const u of users) {
            const roleName = u.role?.name ?? null;
            if (roleName === null || roleName !== u.safariRole) {
                mismatches.push({
                    userId: u.id,
                    username: u.username,
                    fullName: u.fullName,
                    safariRole: u.safariRole,
                    roleName,
                    branchId: u.branchId,
                    isActive: u.isActive,
                });
            }
        }
        const status = mismatches.length === 0 ? 'PASS' : 'FAIL';
        if (status === 'FAIL') {
            this.logger.warn(JSON.stringify({
                event: 'role_consistency_drift',
                totalActiveUsers: users.length,
                mismatchCount: mismatches.length,
                sample: mismatches.slice(0, 5).map((m) => ({
                    userId: m.userId,
                    username: m.username,
                    safariRole: m.safariRole,
                    roleName: m.roleName,
                })),
            }));
        }
        return {
            status,
            totalActiveUsers: users.length,
            mismatches,
            generatedAt: new Date().toISOString(),
        };
    }
};
exports.RoleConsistencyService = RoleConsistencyService;
exports.RoleConsistencyService = RoleConsistencyService = RoleConsistencyService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], RoleConsistencyService);
//# sourceMappingURL=role-consistency.service.js.map