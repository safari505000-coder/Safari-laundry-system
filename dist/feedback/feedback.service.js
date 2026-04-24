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
exports.FeedbackService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let FeedbackService = class FeedbackService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async publicGetOrder(orderId) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                serialNumber: true,
                invoiceNumber: true,
                totalPrice: true,
                createdAt: true,
                status: true,
                driver: { select: { fullName: true } },
                customer: { select: { displayName: true } },
                feedback: {
                    select: {
                        rating: true,
                        note: true,
                        submittedAt: true,
                    },
                },
            },
        });
        if (!order) {
            throw new common_1.NotFoundException('INVOICE_NOT_FOUND');
        }
        const driverFirst = order.driver?.fullName?.split(/\s+/u).filter(Boolean)[0] ?? null;
        const customerFirst = order.customer.displayName?.split(/\s+/u).filter(Boolean)[0] ?? null;
        return {
            orderId: order.id,
            serialNumber: order.serialNumber,
            invoiceNumber: order.invoiceNumber,
            totalKd: order.totalPrice.toString(),
            createdAt: order.createdAt.toISOString(),
            driverFirstName: driverFirst,
            customerFirstName: customerFirst,
            alreadyRated: order.feedback
                ? {
                    rating: order.feedback.rating,
                    note: order.feedback.note,
                    submittedAt: order.feedback.submittedAt.toISOString(),
                }
                : null,
        };
    }
    async submitFeedback(orderId, dto, clientIp) {
        const exists = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { id: true },
        });
        if (!exists) {
            throw new common_1.NotFoundException('INVOICE_NOT_FOUND');
        }
        if (dto.rating < 1 || dto.rating > 5) {
            throw new common_1.BadRequestException('RATING_OUT_OF_RANGE');
        }
        const note = dto.note?.trim() ? dto.note.trim() : null;
        const row = await this.prisma.orderFeedback.upsert({
            where: { orderId },
            create: {
                orderId,
                rating: dto.rating,
                note,
                submittedFrom: clientIp,
            },
            update: {
                rating: dto.rating,
                note,
                submittedFrom: clientIp,
                acknowledgedAt: null,
                acknowledgedBy: null,
            },
            select: {
                rating: true,
                note: true,
                submittedAt: true,
                updatedAt: true,
            },
        });
        return {
            ok: true,
            rating: row.rating,
            note: row.note,
            at: row.updatedAt.toISOString(),
        };
    }
    async listFeedback(opts) {
        const take = Math.min(Math.max(opts.take ?? 50, 1), 200);
        const skip = Math.max(opts.skip ?? 0, 0);
        const where = {};
        if (opts.onlyUnread)
            where.acknowledgedAt = null;
        if (opts.minRating != null || opts.maxRating != null) {
            where.rating = {
                ...(opts.minRating != null ? { gte: opts.minRating } : {}),
                ...(opts.maxRating != null ? { lte: opts.maxRating } : {}),
            };
        }
        const [rows, total, unread, avgAgg] = await Promise.all([
            this.prisma.orderFeedback.findMany({
                where,
                orderBy: { submittedAt: 'desc' },
                take,
                skip,
                select: {
                    id: true,
                    rating: true,
                    note: true,
                    submittedAt: true,
                    submittedFrom: true,
                    acknowledgedAt: true,
                    acknowledgedBy: true,
                    order: {
                        select: {
                            id: true,
                            serialNumber: true,
                            invoiceNumber: true,
                            totalPrice: true,
                            createdAt: true,
                            status: true,
                            driver: {
                                select: { id: true, fullName: true, username: true },
                            },
                            customer: {
                                select: { id: true, displayName: true, phone: true },
                            },
                        },
                    },
                },
            }),
            this.prisma.orderFeedback.count({ where }),
            this.prisma.orderFeedback.count({ where: { acknowledgedAt: null } }),
            this.prisma.orderFeedback.aggregate({
                _avg: { rating: true },
                _count: { rating: true },
            }),
        ]);
        return {
            total,
            unread,
            avgRating: avgAgg._avg.rating ?? 0,
            ratedCount: avgAgg._count.rating ?? 0,
            rows: rows.map((r) => ({
                id: r.id,
                rating: r.rating,
                note: r.note,
                submittedAt: r.submittedAt.toISOString(),
                ipMasked: maskIp(r.submittedFrom),
                acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
                order: {
                    id: r.order.id,
                    serialNumber: r.order.serialNumber,
                    invoiceNumber: r.order.invoiceNumber,
                    totalKd: r.order.totalPrice.toString(),
                    createdAt: r.order.createdAt.toISOString(),
                    status: r.order.status,
                    driver: r.order.driver
                        ? {
                            id: r.order.driver.id,
                            fullName: r.order.driver.fullName,
                            username: r.order.driver.username,
                        }
                        : null,
                    customer: {
                        id: r.order.customer.id,
                        displayName: r.order.customer.displayName,
                        phone: r.order.customer.phone,
                    },
                },
            })),
        };
    }
    async acknowledge(id, userId) {
        const existing = await this.prisma.orderFeedback.findUnique({
            where: { id },
            select: { id: true, acknowledgedAt: true },
        });
        if (!existing)
            throw new common_1.NotFoundException('FEEDBACK_NOT_FOUND');
        if (existing.acknowledgedAt) {
            return { ok: true, alreadyAcknowledged: true };
        }
        await this.prisma.orderFeedback.update({
            where: { id },
            data: {
                acknowledgedAt: new Date(),
                acknowledgedBy: userId,
            },
        });
        return { ok: true, alreadyAcknowledged: false };
    }
};
exports.FeedbackService = FeedbackService;
exports.FeedbackService = FeedbackService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], FeedbackService);
function maskIp(raw) {
    if (!raw)
        return null;
    const ip = raw.trim();
    if (ip.includes(':')) {
        const parts = ip.split(':');
        return `${parts.slice(0, 2).join(':')}:*`;
    }
    const parts = ip.split('.');
    if (parts.length !== 4)
        return ip;
    return `${parts[0]}.${parts[1]}.*.*`;
}
//# sourceMappingURL=feedback.service.js.map