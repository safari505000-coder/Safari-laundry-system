"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var WeeklyExecutiveReportService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeeklyExecutiveReportService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const node_fs_1 = require("node:fs");
const node_fs_2 = require("node:fs");
const node_path_1 = require("node:path");
const pdfkit_1 = __importDefault(require("pdfkit"));
const prisma_service_1 = require("../prisma/prisma.service");
const insights_service_1 = require("./insights.service");
let WeeklyExecutiveReportService = WeeklyExecutiveReportService_1 = class WeeklyExecutiveReportService {
    prisma;
    insights;
    logger = new common_1.Logger(WeeklyExecutiveReportService_1.name);
    archiveDir = (0, node_path_1.join)(process.cwd(), 'uploads', 'executive-reports');
    constructor(prisma, insights) {
        this.prisma = prisma;
        this.insights = insights;
        void node_fs_1.promises.mkdir(this.archiveDir, { recursive: true }).catch(() => undefined);
    }
    async runWeekly() {
        try {
            const entry = await this.generateLatest();
            this.logger.log(`Weekly executive report archived: ${entry.key} (${entry.sizeBytes} bytes)`);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(`Weekly executive report FAILED: ${msg}`);
        }
    }
    async generateLatest() {
        const { key, from, to } = currentIsoWeek(new Date());
        const filename = `${key}.pdf`;
        const filepath = (0, node_path_1.join)(this.archiveDir, filename);
        const payload = await this.collectPayload(from, to);
        await this.writePdf(filepath, { key, from, to, ...payload });
        const stat = await node_fs_1.promises.stat(filepath);
        return {
            key,
            filename,
            sizeBytes: stat.size,
            generatedAt: stat.mtime.toISOString(),
            periodFrom: from.toISOString(),
            periodTo: to.toISOString(),
        };
    }
    async listArchive() {
        await node_fs_1.promises.mkdir(this.archiveDir, { recursive: true });
        const entries = await node_fs_1.promises.readdir(this.archiveDir);
        const pdfs = entries.filter((e) => e.toLowerCase().endsWith('.pdf'));
        const out = await Promise.all(pdfs.map(async (name) => {
            const stat = await node_fs_1.promises.stat((0, node_path_1.join)(this.archiveDir, name));
            return {
                key: name.replace(/\.pdf$/i, ''),
                filename: name,
                sizeBytes: stat.size,
                generatedAt: stat.mtime.toISOString(),
            };
        }));
        return out.sort((a, b) => (a.key < b.key ? 1 : -1));
    }
    async openReport(key) {
        if (key === 'latest') {
            const list = await this.listArchive();
            if (list.length === 0) {
                const entry = await this.generateLatest();
                return this.openReport(entry.key);
            }
            return this.openReport(list[0].key);
        }
        if (!/^\d{4}-W\d{2}$/.test(key)) {
            throw new common_1.NotFoundException('Invalid weekly report key');
        }
        const filename = `${key}.pdf`;
        const filepath = (0, node_path_1.join)(this.archiveDir, filename);
        if (!(0, node_fs_2.existsSync)(filepath)) {
            const now = currentIsoWeek(new Date());
            if (now.key === key) {
                await this.generateLatest();
            }
            else {
                throw new common_1.NotFoundException(`Weekly executive report ${key} not found`);
            }
        }
        return { stream: (0, node_fs_1.createReadStream)(filepath), filename };
    }
    async collectPayload(from, to) {
        const [orders, expenses, payroll] = await Promise.all([
            this.prisma.order.findMany({
                where: {
                    completedAt: { gte: from, lt: to },
                    status: 'COMPLETED',
                },
                select: {
                    completedAt: true,
                    totalPrice: true,
                    driverId: true,
                    posPaymentMethod: true,
                },
            }),
            this.prisma.branchExpense.findMany({
                where: { expenseDate: { gte: from, lt: to } },
                select: { amount: true, category: true },
            }),
            this.prisma.payroll.findMany({
                where: { paymentDate: { gte: from, lt: to } },
                select: { basicSalary: true, allowances: true, deductions: true },
            }),
        ]);
        const revenue = sum(orders.map((o) => Number(o.totalPrice)));
        const expenseCash = sum(expenses.map((e) => Number(e.amount)));
        const payrollTotal = sum(payroll.map((p) => Number(p.basicSalary) + Number(p.allowances) - Number(p.deductions)));
        const grossProfit = revenue - expenseCash - payrollTotal;
        const paymentMix = {};
        for (const o of orders) {
            const key = o.posPaymentMethod ?? 'UNKNOWN';
            paymentMix[key] = (paymentMix[key] ?? 0) + Number(o.totalPrice);
        }
        const activeDrivers = new Set(orders.map((o) => o.driverId).filter((x) => x != null)).size;
        const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
        const scorecard = await this.insights.driverScorecard(days);
        const topDrivers = scorecard.drivers.slice(0, 5);
        return {
            totals: {
                orders: orders.length,
                revenue: round3(revenue),
                expenseCash: round3(expenseCash),
                payrollTotal: round3(payrollTotal),
                grossProfit: round3(grossProfit),
                activeDrivers,
            },
            paymentMix: Object.entries(paymentMix).map(([method, amount]) => ({
                method,
                amount: round3(amount),
            })),
            topDrivers,
        };
    }
    async writePdf(filepath, data) {
        const doc = new pdfkit_1.default({ size: 'A4', margin: 48 });
        const stream = (await Promise.resolve().then(() => __importStar(require('node:fs')))).createWriteStream(filepath);
        doc.pipe(stream);
        const BRAND = '#0F766E';
        const fromLabel = data.from.toISOString().slice(0, 10);
        const toLabel = new Date(data.to.getTime() - 1).toISOString().slice(0, 10);
        doc.fillColor(BRAND).fontSize(20).text('Safari Omni', { align: 'left' });
        doc
            .fillColor('#0F172A')
            .fontSize(14)
            .text('Weekly Executive Report', { align: 'left' });
        doc
            .fillColor('#64748B')
            .fontSize(10)
            .text(`Week ${data.key}    ·    ${fromLabel} → ${toLabel}`, { align: 'left' });
        doc.moveDown(0.8);
        doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor(BRAND).stroke();
        doc.moveDown(0.8);
        const t = data.totals;
        const kpis = [
            ['Revenue (KD)', t.revenue.toFixed(3)],
            ['Operating Expenses (KD)', t.expenseCash.toFixed(3)],
            ['Payroll (KD)', t.payrollTotal.toFixed(3)],
            ['Gross Profit (KD)', t.grossProfit.toFixed(3)],
            ['Completed Orders', String(t.orders)],
            ['Active Drivers', String(t.activeDrivers)],
        ];
        doc.fillColor('#0F172A').fontSize(12).text('Key Performance Indicators');
        doc.moveDown(0.4);
        const colW = (547 - 48) / 2;
        kpis.forEach(([label, value], i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const x = 48 + col * colW;
            const y = doc.y + row * 38;
            doc.roundedRect(x, y, colW - 10, 32, 6).strokeColor('#E2E8F0').stroke();
            doc.fillColor('#64748B').fontSize(9).text(label, x + 10, y + 6);
            doc.fillColor('#0F172A').fontSize(13).text(value, x + 10, y + 16);
        });
        doc.y += Math.ceil(kpis.length / 2) * 38 + 12;
        doc.fillColor('#0F172A').fontSize(12).text('Payment Mix');
        doc.moveDown(0.3);
        if (data.paymentMix.length === 0) {
            doc.fillColor('#64748B').fontSize(10).text('No completed orders.');
        }
        else {
            const total = data.paymentMix.reduce((a, b) => a + b.amount, 0) || 1;
            const barW = 499;
            let x = 48;
            const y = doc.y + 4;
            const palette = ['#0F766E', '#2563EB', '#D97706', '#9333EA', '#DC2626'];
            data.paymentMix.forEach((p, i) => {
                const w = (p.amount / total) * barW;
                doc.rect(x, y, w, 16).fillColor(palette[i % palette.length]).fill();
                x += w;
            });
            doc.y = y + 20;
            doc.fillColor('#0F172A').fontSize(9);
            data.paymentMix.forEach((p, i) => {
                const pct = ((p.amount / total) * 100).toFixed(1);
                doc.fillColor(palette[i % palette.length]).text(`■ ${p.method}  ${p.amount.toFixed(3)} KD  (${pct}%)`, 48, doc.y);
            });
        }
        doc.moveDown(0.8);
        doc.fillColor('#0F172A').fontSize(12).text('Top Drivers (by composite score)');
        doc.moveDown(0.3);
        if (data.topDrivers.length === 0) {
            doc.fillColor('#64748B').fontSize(10).text('No driver activity in window.');
        }
        else {
            const headers = ['Driver', 'Trips', 'Revenue (KD)', 'Score'];
            const widths = [240, 70, 110, 80];
            let cx = 48;
            const hy = doc.y;
            doc.fillColor('#64748B').fontSize(9);
            headers.forEach((h, i) => {
                doc.text(h, cx, hy, { width: widths[i] });
                cx += widths[i];
            });
            doc.y = hy + 14;
            doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#E2E8F0').stroke();
            doc.moveDown(0.2);
            data.topDrivers.forEach((d) => {
                const ry = doc.y + 2;
                let rx = 48;
                const cells = [
                    d.fullName,
                    String(d.trips),
                    d.revenueKd.toFixed(3),
                    d.score.toFixed(1),
                ];
                doc.fillColor('#0F172A').fontSize(10);
                cells.forEach((c, i) => {
                    doc.text(c, rx, ry, { width: widths[i] });
                    rx += widths[i];
                });
                doc.y = ry + 14;
            });
        }
        doc.moveDown(1.5);
        doc
            .fillColor('#94A3B8')
            .fontSize(8)
            .text(`Generated ${new Date().toISOString()} · Auto-archived under uploads/executive-reports/${data.key}.pdf`, 48, undefined, { align: 'center', width: 499 });
        doc.end();
        await new Promise((resolve, reject) => {
            stream.on('finish', () => resolve());
            stream.on('error', (err) => reject(err));
        });
    }
};
exports.WeeklyExecutiveReportService = WeeklyExecutiveReportService;
__decorate([
    (0, schedule_1.Cron)('0 7 * * 0', { timeZone: 'Asia/Kuwait' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], WeeklyExecutiveReportService.prototype, "runWeekly", null);
exports.WeeklyExecutiveReportService = WeeklyExecutiveReportService = WeeklyExecutiveReportService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        insights_service_1.InsightsService])
], WeeklyExecutiveReportService);
function sum(xs) {
    return xs.reduce((a, b) => a + b, 0);
}
function round3(n) {
    return Math.round(n * 1000) / 1000;
}
function currentIsoWeek(d) {
    const KUW = 3 * 60 * 60 * 1000;
    const local = new Date(d.getTime() + KUW);
    const dow = (local.getUTCDay() + 6) % 7;
    local.setUTCHours(0, 0, 0, 0);
    local.setUTCDate(local.getUTCDate() - dow);
    const fromLocal = new Date(local);
    const toLocal = new Date(local);
    toLocal.setUTCDate(toLocal.getUTCDate() + 7);
    const from = new Date(fromLocal.getTime() - KUW);
    const to = new Date(toLocal.getTime() - KUW);
    const thu = new Date(fromLocal);
    thu.setUTCDate(thu.getUTCDate() + 3);
    const year = thu.getUTCFullYear();
    const firstThu = new Date(Date.UTC(year, 0, 4));
    const dayDiff = (thu.getTime() - firstThu.getTime()) / (24 * 60 * 60 * 1000);
    const firstThuDow = (firstThu.getUTCDay() + 6) % 7;
    const weekNum = Math.floor((dayDiff + firstThuDow) / 7) + 1;
    const key = `${year}-W${String(weekNum).padStart(2, '0')}`;
    return { key, from, to };
}
//# sourceMappingURL=weekly-executive-report.service.js.map