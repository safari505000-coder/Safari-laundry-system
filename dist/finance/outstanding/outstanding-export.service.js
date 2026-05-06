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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutstandingExportService = void 0;
const common_1 = require("@nestjs/common");
const exceljs_1 = __importDefault(require("exceljs"));
const node_stream_1 = require("node:stream");
const outstanding_service_1 = require("./outstanding.service");
const STATUS_LABEL = {
    NORMAL: 'عادي',
    LATE: 'متأخر',
    RISK: 'خطر',
};
let OutstandingExportService = class OutstandingExportService {
    outstanding;
    constructor(outstanding) {
        this.outstanding = outstanding;
    }
    async toXlsx(query, actor) {
        const data = await this.outstanding.listOutstanding(query, actor);
        const wb = new exceljs_1.default.Workbook();
        wb.creator = 'Safari Omni';
        wb.created = new Date();
        const ws = wb.addWorksheet('Outstanding');
        ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: 3 }];
        ws.mergeCells(1, 1, 1, 11);
        const titleCell = ws.getCell(1, 1);
        titleCell.value = 'كشف الذمم المدينة';
        titleCell.font = { size: 14, bold: true, color: { argb: 'FF0F766E' } };
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
        ws.mergeCells(2, 1, 2, 11);
        const sub = ws.getCell(2, 1);
        const windowLabel = data.fromIso.slice(0, 10) === '1970-01-01'
            ? `جميع الفترات — اعتبارًا من ${data.toIso.slice(0, 10)}`
            : `من ${data.fromIso.slice(0, 10)} إلى ${data.toIso.slice(0, 10)}`;
        sub.value = `${windowLabel} — ${data.totalCustomers} عميل / ${data.totalInvoices} فاتورة`;
        sub.font = { size: 9, color: { argb: 'FF64748B' } };
        sub.alignment = { horizontal: 'center' };
        ws.getRow(3).values = [
            'العميل',
            'الهاتف',
            'السائق',
            'عدد الفواتير',
            'إجمالي المستحق (د.ك)',
            'تاريخ آخر فاتورة',
            'تاريخ الاستحقاق',
            'أيام التأخير',
            'الأولوية',
            'الحالة',
            'محظور',
        ];
        ws.columns = [
            { key: 'name', width: 28 },
            { key: 'phone', width: 16 },
            { key: 'driverName', width: 24 },
            { key: 'invoicesCount', width: 14 },
            { key: 'totalDueKd', width: 18 },
            { key: 'lastOrderAt', width: 22 },
            { key: 'dueDate', width: 18 },
            { key: 'daysLate', width: 12 },
            { key: 'priorityScore', width: 14 },
            { key: 'status', width: 12 },
            { key: 'blocked', width: 10 },
        ];
        this.styleHeader(ws, 3);
        for (const row of data.rows) {
            const r = ws.addRow({
                name: row.name ?? '—',
                phone: row.phone,
                driverName: row.driverName ?? '—',
                invoicesCount: row.invoicesCount,
                totalDueKd: row.totalDueKd,
                lastOrderAt: row.lastOrderAt
                    ? new Date(row.lastOrderAt).toLocaleString('ar-KW')
                    : '—',
                dueDate: row.earliestDueDate
                    ? new Date(row.earliestDueDate).toLocaleDateString('ar-KW')
                    : '—',
                daysLate: row.daysLate,
                priorityScore: row.priorityScore,
                status: STATUS_LABEL[row.status] ?? row.status,
                blocked: row.blocked ? 'نعم' : 'لا',
            });
            r.getCell('totalDueKd').numFmt = '#,##0.000';
            r.getCell('priorityScore').numFmt = '#,##0.000';
            if (row.blocked) {
                r.getCell('blocked').font = { bold: true, color: { argb: 'FFB91C1C' } };
            }
        }
        const totalsRow = ws.addRow({
            name: 'الإجمالي',
            invoicesCount: data.totalInvoices,
            totalDueKd: data.totalDueKd,
        });
        totalsRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FF0F766E' } };
            cell.border = {
                top: { style: 'medium', color: { argb: 'FF0F766E' } },
            };
        });
        totalsRow.getCell('totalDueKd').numFmt = '#,##0.000';
        const buffer = await wb.xlsx.writeBuffer();
        const stream = new node_stream_1.PassThrough();
        stream.end(Buffer.from(buffer));
        return {
            stream,
            filename: `outstanding-${data.toIso.slice(0, 10)}.xlsx`,
        };
    }
    styleHeader(ws, rowIdx) {
        const h = ws.getRow(rowIdx);
        h.height = 22;
        h.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF0F766E' },
            };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });
    }
};
exports.OutstandingExportService = OutstandingExportService;
exports.OutstandingExportService = OutstandingExportService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [outstanding_service_1.OutstandingService])
], OutstandingExportService);
//# sourceMappingURL=outstanding-export.service.js.map