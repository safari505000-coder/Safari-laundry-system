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
exports.LeavesService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const LEAVE_INCLUDE = {
    user: {
        select: {
            id: true,
            fullName: true,
            username: true,
            employeeId: true,
            civilId: true,
            jobTitle: true,
            branch: { select: { id: true, name: true } },
        },
    },
    approvedBy: {
        select: { id: true, fullName: true, username: true },
    },
};
function isApprover(role) {
    return (role === client_1.SafariRole.OWNER ||
        role === client_1.SafariRole.GENERAL_MANAGER ||
        role === client_1.SafariRole.MANAGER ||
        role === client_1.SafariRole.ACCOUNTANT);
}
function diffDays(start, end) {
    const ms = end.getTime() - start.getTime();
    return Math.max(1, Math.floor(ms / (24 * 60 * 60 * 1000)) + 1);
}
let LeavesService = class LeavesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(actorUserId, dto) {
        const start = new Date(dto.startDate);
        const end = new Date(dto.endDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            throw new common_1.BadRequestException('Invalid dates');
        }
        if (end < start) {
            throw new common_1.BadRequestException('endDate must be on/after startDate');
        }
        const row = await this.prisma.leaveRequest.create({
            data: {
                userId: actorUserId,
                type: dto.type,
                startDate: start,
                endDate: end,
                daysCount: diffDays(start, end),
                reason: dto.reason ?? null,
                status: client_1.LeaveStatus.PENDING,
            },
            include: LEAVE_INCLUDE,
        });
        return row;
    }
    async list(actorRole, actorUserId, q) {
        const where = {
            ...(q.status ? { status: q.status } : {}),
            ...(q.type ? { type: q.type } : {}),
            ...(q.userId ? { userId: q.userId } : {}),
            ...(q.from || q.to
                ? {
                    startDate: {
                        ...(q.from ? { gte: new Date(q.from) } : {}),
                        ...(q.to ? { lte: new Date(q.to) } : {}),
                    },
                }
                : {}),
        };
        if (!isApprover(actorRole)) {
            where.userId = actorUserId;
        }
        return this.prisma.leaveRequest.findMany({
            where,
            include: LEAVE_INCLUDE,
            orderBy: { createdAt: 'desc' },
            take: 500,
        });
    }
    async listMine(actorUserId) {
        return this.prisma.leaveRequest.findMany({
            where: { userId: actorUserId },
            include: LEAVE_INCLUDE,
            orderBy: { createdAt: 'desc' },
        });
    }
    async findOne(actorRole, actorUserId, id) {
        const row = await this.prisma.leaveRequest.findUnique({
            where: { id },
            include: LEAVE_INCLUDE,
        });
        if (!row)
            throw new common_1.NotFoundException('Leave request not found');
        if (!isApprover(actorRole) && row.userId !== actorUserId) {
            throw new common_1.ForbiddenException();
        }
        return row;
    }
    async approve(actorRole, actorUserId, id) {
        if (!isApprover(actorRole))
            throw new common_1.ForbiddenException();
        const current = await this.prisma.leaveRequest.findUnique({
            where: { id },
        });
        if (!current)
            throw new common_1.NotFoundException('Leave request not found');
        if (current.status !== client_1.LeaveStatus.PENDING) {
            throw new common_1.BadRequestException('Only PENDING requests can be approved');
        }
        return this.prisma.leaveRequest.update({
            where: { id },
            data: {
                status: client_1.LeaveStatus.APPROVED,
                approvedById: actorUserId,
                approvedAt: new Date(),
            },
            include: LEAVE_INCLUDE,
        });
    }
    async reject(actorRole, actorUserId, id, reason) {
        if (!isApprover(actorRole))
            throw new common_1.ForbiddenException();
        const current = await this.prisma.leaveRequest.findUnique({
            where: { id },
        });
        if (!current)
            throw new common_1.NotFoundException('Leave request not found');
        if (current.status !== client_1.LeaveStatus.PENDING) {
            throw new common_1.BadRequestException('Only PENDING requests can be rejected');
        }
        return this.prisma.leaveRequest.update({
            where: { id },
            data: {
                status: client_1.LeaveStatus.REJECTED,
                approvedById: actorUserId,
                approvedAt: new Date(),
                rejectedReason: reason,
            },
            include: LEAVE_INCLUDE,
        });
    }
    async cancel(actorUserId, id) {
        const current = await this.prisma.leaveRequest.findUnique({
            where: { id },
        });
        if (!current)
            throw new common_1.NotFoundException('Leave request not found');
        if (current.userId !== actorUserId)
            throw new common_1.ForbiddenException();
        if (current.status !== client_1.LeaveStatus.PENDING) {
            throw new common_1.BadRequestException('Only your own PENDING request can be cancelled');
        }
        return this.prisma.leaveRequest.update({
            where: { id },
            data: { status: client_1.LeaveStatus.CANCELLED },
            include: LEAVE_INCLUDE,
        });
    }
};
exports.LeavesService = LeavesService;
exports.LeavesService = LeavesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], LeavesService);
//# sourceMappingURL=leaves.service.js.map