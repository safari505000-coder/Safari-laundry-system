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
exports.ExportsService = void 0;
const common_1 = require("@nestjs/common");
const exceljs_1 = __importDefault(require("exceljs"));
const pdfkit_1 = __importDefault(require("pdfkit"));
const node_stream_1 = require("node:stream");
const attendance_service_1 = require("../attendance/attendance.service");
const finance_service_1 = require("../finance/finance.service");
const inventory_service_1 = require("../inventory/inventory.service");
const payroll_service_1 = require("../payroll/payroll.service");
const reports_service_1 = require("../reports/reports.service");
let ExportsService = class ExportsService {
    reports;
    attendance;
    payroll;
    finance;
    inventory;
    constructor(reports, attendance, payroll, finance, inventory) {
        this.reports = reports;
        this.attendance = attendance;
        this.payroll = payroll;
        this.finance = finance;
        this.inventory = inventory;
    }
    async issuedInvoicesXlsx(fromIso, toIso, driverId, branchId) {
        const { rows, from, to } = await this.reports.issuedInvoices(fromIso, toIso, driverId, undefined, branchId);
        const cols = [
            { header: 'رقم الفاتورة', key: 'invoiceNumber', width: 18 },
            { header: 'التاريخ', key: 'createdAt', width: 20 },
            { header: 'السائق', key: 'driverName', width: 26 },
            { header: 'العميل', key: 'customerName', width: 24 },
            { header: 'الهاتف', key: 'customerPhone', width: 16 },
            { header: 'طريقة الدفع', key: 'posPaymentMethod', width: 14 },
            { header: 'الحالة', key: 'status', width: 14 },
            { header: 'حالة الكاش', key: 'cashStatus', width: 18 },
            { header: 'المبلغ (د.ك)', key: 'totalPrice', width: 14, money: true },
        ];
        const data = rows.map((r) => ({
            invoiceNumber: r.invoiceNumber ?? '—',
            createdAt: new Date(r.createdAt).toLocaleString('ar-KW'),
            driverName: r.driver?.fullName ?? '—',
            customerName: r.customer?.displayName ?? '—',
            customerPhone: r.customer?.phone ?? '—',
            posPaymentMethod: r.posPaymentMethod ?? '—',
            status: r.status,
            cashStatus: r.cashStatus,
            totalPrice: Number(r.totalPrice),
        }));
        return this.buildWorkbook({
            title: 'Issued invoices',
            subtitle: `From ${String(from).slice(0, 10)} to ${String(to).slice(0, 10)} — ${rows.length} rows`,
            cols,
            data,
            totals: [
                {
                    col: 'totalPrice',
                    label: 'إجمالي المبلغ',
                    value: data.reduce((s, r) => s + r.totalPrice, 0),
                },
            ],
        });
    }
    async unifiedLedgerXlsx(fromIso, toIso, driverId, branchId) {
        const res = await this.reports.unifiedLedgerStream(fromIso, toIso, driverId, branchId);
        const r = res;
        const cols = [
            { header: 'التاريخ', key: 'createdAt', width: 22 },
            { header: 'نوع القيد', key: 'entryType', width: 22 },
            { header: 'المبلغ (د.ك)', key: 'amountKd', width: 14, money: true },
            { header: 'الفاتورة', key: 'orderLabel', width: 22 },
            { header: 'المصروف', key: 'expenseLabel', width: 28 },
            { header: 'السائق', key: 'driverName', width: 22 },
            { header: 'ملاحظة', key: 'note', width: 40 },
        ];
        const data = (r.rows ?? []).map((row) => ({
            createdAt: new Date(row.createdAt).toLocaleString('ar-KW'),
            entryType: row.entryType,
            amountKd: Number(row.amountKd ?? 0),
            orderLabel: row.orderLabel ?? '—',
            expenseLabel: row.expenseLabel ?? '—',
            driverName: row.driverName ?? '—',
            note: row.note ?? '',
        }));
        return this.buildWorkbook({
            title: 'Unified ledger',
            subtitle: `${r.from ?? fromIso} → ${r.to ?? toIso} — ${data.length} entries`,
            cols,
            data,
            totals: [
                {
                    col: 'amountKd',
                    label: 'إجمالي الحركات',
                    value: data.reduce((s, x) => s + x.amountKd, 0),
                },
            ],
        });
    }
    async attendanceXlsx(q) {
        const rows = await this.attendance.list(q);
        const cols = [
            { header: 'التاريخ', key: 'date', width: 14 },
            { header: 'الموظف', key: 'userName', width: 26 },
            { header: 'اسم المستخدم', key: 'username', width: 18 },
            { header: 'الفرع', key: 'branchName', width: 20 },
            { header: 'دخول', key: 'checkIn', width: 20 },
            { header: 'خروج', key: 'checkOut', width: 20 },
            { header: 'المدة (دقائق)', key: 'durationMinutes', width: 14 },
            { header: 'المصدر', key: 'source', width: 14 },
            { header: 'ملاحظة', key: 'note', width: 30 },
        ];
        const data = rows.map((r) => ({
            date: r.date,
            userName: r.userName,
            username: r.username,
            branchName: r.branchName ?? '—',
            checkIn: r.checkInAtIso
                ? new Date(r.checkInAtIso).toLocaleString('ar-KW')
                : '—',
            checkOut: r.checkOutAtIso
                ? new Date(r.checkOutAtIso).toLocaleString('ar-KW')
                : '—',
            durationMinutes: r.durationMinutes ?? 0,
            source: r.source,
            note: r.note ?? '',
        }));
        return this.buildWorkbook({
            title: 'Attendance',
            subtitle: `${rows.length} rows`,
            cols,
            data,
            totals: [
                {
                    col: 'durationMinutes',
                    label: 'إجمالي الدقائق',
                    value: data.reduce((s, x) => s + x.durationMinutes, 0),
                },
            ],
        });
    }
    async payrollXlsx(actorRole, fromIso, toIso, branchId) {
        const rows = await this.payroll.list(actorRole, fromIso, toIso, branchId);
        const cols = [
            { header: 'تاريخ الصرف', key: 'paymentDate', width: 16 },
            { header: 'الموظف', key: 'userName', width: 26 },
            { header: 'الفرع', key: 'branchName', width: 20 },
            { header: 'الراتب الأساسي', key: 'basic', width: 16, money: true },
            { header: 'البدلات', key: 'allow', width: 14, money: true },
            { header: 'الخصومات', key: 'ded', width: 14, money: true },
            { header: 'الصافي', key: 'net', width: 16, money: true },
            { header: 'الحالة', key: 'status', width: 14 },
        ];
        const data = rows.map((r) => {
            const basic = Number(r.basicSalary);
            const allow = Number(r.allowances);
            const ded = Number(r.deductions);
            return {
                paymentDate: r.paymentDate.toISOString().slice(0, 10),
                userName: r.user.fullName,
                branchName: r.branch?.name ?? '—',
                basic,
                allow,
                ded,
                net: basic + allow - ded,
                status: r.status,
            };
        });
        return this.buildWorkbook({
            title: 'Payroll',
            subtitle: `${fromIso.slice(0, 10)} → ${toIso.slice(0, 10)} — ${data.length} rows`,
            cols,
            data,
            totals: [
                {
                    col: 'net',
                    label: 'إجمالي الصافي',
                    value: data.reduce((s, x) => s + x.net, 0),
                },
            ],
        });
    }
    async inventoryReportXlsx(filters) {
        const report = await this.inventory.report(filters);
        const cols = [
            { header: 'الكود', key: 'code', width: 14 },
            { header: 'الصنف', key: 'nameAr', width: 28 },
            { header: 'الفئة', key: 'categoryNameAr', width: 18 },
            { header: 'الفرع', key: 'branchName', width: 18 },
            { header: 'الوحدة', key: 'unit', width: 10 },
            { header: 'الكمية', key: 'quantityOnHand', width: 14, money: true },
            { header: 'نقطة إعادة الطلب', key: 'reorderPointEffective', width: 18, money: true },
            { header: 'متوسط التكلفة', key: 'avgUnitCost', width: 16, money: true },
            { header: 'الحالة', key: 'status', width: 14 },
        ];
        const data = report.rows.map((r) => ({
            code: r.code,
            nameAr: r.nameAr,
            categoryNameAr: r.categoryNameAr ?? '—',
            branchName: r.branchName,
            unit: r.unit,
            quantityOnHand: Number(r.quantityOnHand),
            reorderPointEffective: Number(r.reorderPointEffective),
            avgUnitCost: r.avgUnitCost ? Number(r.avgUnitCost) : 0,
            status: r.status,
        }));
        return this.buildWorkbook({
            title: 'Inventory',
            subtitle: `${report.summary.totalSkus} SKU-branches · ${report.summary.outOfStock} نفد · ${report.summary.lowStock} منخفض · قيمة ${report.summary.inventoryValueKd} د.ك`,
            cols,
            data,
            totals: [
                {
                    col: 'quantityOnHand',
                    label: 'إجمالي الكمية',
                    value: data.reduce((s, x) => s + x.quantityOnHand, 0),
                },
            ],
        });
    }
    async stockMovementsXlsx(q) {
        const rows = await this.inventory.listMovements(q);
        const cols = [
            { header: 'التاريخ', key: 'createdAt', width: 20 },
            { header: 'النوع', key: 'type', width: 14 },
            { header: 'الكود', key: 'code', width: 14 },
            { header: 'الصنف', key: 'nameAr', width: 26 },
            { header: 'الفرع', key: 'branchName', width: 18 },
            { header: 'الكمية', key: 'quantity', width: 12, money: true },
            { header: 'التكلفة/الوحدة', key: 'unitCost', width: 14, money: true },
            { header: 'الإجمالي', key: 'totalCost', width: 14, money: true },
            { header: 'المورد', key: 'supplierName', width: 20 },
            { header: 'المرجع', key: 'reference', width: 18 },
            { header: 'سجّل بواسطة', key: 'recordedBy', width: 20 },
            { header: 'ملاحظة', key: 'note', width: 30 },
        ];
        const data = rows.map((m) => ({
            createdAt: new Date(m.createdAt).toLocaleString('ar-KW'),
            type: m.type,
            code: m.stockItem.code,
            nameAr: m.stockItem.nameAr,
            branchName: m.branchName,
            quantity: Number(m.quantity),
            unitCost: m.unitCost ? Number(m.unitCost) : 0,
            totalCost: m.totalCost ? Number(m.totalCost) : 0,
            supplierName: m.supplierName ?? '—',
            reference: m.reference ?? '—',
            recordedBy: m.recordedBy?.fullName ?? '—',
            note: m.note ?? '',
        }));
        return this.buildWorkbook({
            title: 'Stock movements',
            subtitle: `${data.length} حركة`,
            cols,
            data,
        });
    }
    async financialCycleXlsx(_dateIso) {
        const cycle = await this.finance.getOwnerFinancialCycleReport();
        const wb = new exceljs_1.default.Workbook();
        wb.creator = 'Safari Omni';
        wb.created = new Date();
        const summary = wb.addWorksheet('الملخص');
        summary.columns = [
            { header: 'البند', key: 'label', width: 30 },
            { header: 'المبلغ (د.ك)', key: 'value', width: 20 },
        ];
        const c = cycle;
        const pairs = Object.entries(c).filter(([, v]) => v !== null &&
            (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'));
        pairs.forEach(([k, v]) => summary.addRow({ label: k, value: v }));
        this.styleHeader(summary);
        return this.bookToStream(wb, 'financial-cycle.xlsx');
    }
    async issuedInvoicesPdf(fromIso, toIso, driverId, branchId) {
        const { rows, from, to } = await this.reports.issuedInvoices(fromIso, toIso, driverId, undefined, branchId);
        const title = 'كشف الفواتير المصدرة';
        const sub = `من ${String(from).slice(0, 10)} إلى ${String(to).slice(0, 10)} — ${rows.length} فاتورة`;
        const table = {
            headers: [
                'رقم الفاتورة',
                'التاريخ',
                'السائق',
                'العميل',
                'الدفع',
                'المبلغ',
            ],
            rows: rows.map((r) => [
                r.invoiceNumber ?? '—',
                new Date(r.createdAt).toLocaleDateString('ar-KW'),
                r.driver?.fullName ?? '—',
                r.customer?.displayName ?? '—',
                r.posPaymentMethod ?? '—',
                Number(r.totalPrice).toFixed(3),
            ]),
        };
        return this.buildTablePdf(title, sub, table, {
            total: rows.reduce((s, r) => s + Number(r.totalPrice), 0),
            totalLabel: 'إجمالي',
        });
    }
    async buildWorkbook(opts) {
        const wb = new exceljs_1.default.Workbook();
        wb.creator = 'Safari Omni';
        wb.created = new Date();
        const ws = wb.addWorksheet(opts.title.slice(0, 30));
        ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: 3 }];
        ws.mergeCells(1, 1, 1, opts.cols.length);
        const titleCell = ws.getCell(1, 1);
        titleCell.value = opts.title;
        titleCell.font = { size: 14, bold: true, color: { argb: 'FF0F766E' } };
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (opts.subtitle) {
            ws.mergeCells(2, 1, 2, opts.cols.length);
            const sub = ws.getCell(2, 1);
            sub.value = opts.subtitle;
            sub.font = { size: 9, color: { argb: 'FF64748B' } };
            sub.alignment = { horizontal: 'center' };
        }
        ws.getRow(3).values = opts.cols.map((c) => c.header);
        ws.columns = opts.cols.map((c) => ({ key: c.key, width: c.width ?? 16 }));
        this.styleHeader(ws, 3);
        for (const row of opts.data) {
            const r = ws.addRow(row);
            for (const col of opts.cols) {
                if (col.money) {
                    const cell = r.getCell(col.key);
                    cell.numFmt = '#,##0.000';
                }
            }
        }
        if (opts.totals?.length) {
            const totalsRow = {};
            for (const t of opts.totals)
                totalsRow[t.col] = t.value;
            totalsRow[opts.cols[0].key] = 'الإجمالي';
            const r = ws.addRow(totalsRow);
            r.eachCell((cell) => {
                cell.font = { bold: true, color: { argb: 'FF0F766E' } };
                cell.border = { top: { style: 'medium', color: { argb: 'FF0F766E' } } };
            });
            for (const t of opts.totals) {
                r.getCell(t.col).numFmt = '#,##0.000';
            }
        }
        return this.bookToStream(wb, `${opts.title}.xlsx`);
    }
    styleHeader(ws, rowIdx = 1) {
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
    async bookToStream(wb, filename) {
        const buffer = await wb.xlsx.writeBuffer();
        const stream = new node_stream_1.PassThrough();
        stream.end(Buffer.from(buffer));
        return { stream, filename };
    }
    buildTablePdf(title, subtitle, table, totals) {
        const doc = new pdfkit_1.default({ size: 'A4', margin: 32 });
        const stream = new node_stream_1.PassThrough();
        doc.pipe(stream);
        doc.fillColor('#0f766e').fontSize(18).text('Safari Omni', { align: 'left' });
        doc.moveDown(0.2);
        doc.fillColor('#0f172a').fontSize(13).text(title, { align: 'left' });
        doc.fillColor('#64748b').fontSize(9).text(subtitle, { align: 'left' });
        doc.moveDown(0.6);
        const pageWidth = doc.page.width - 64;
        const colCount = table.headers.length;
        const colWidth = pageWidth / colCount;
        const drawRow = (cells, opts) => {
            const y = doc.y;
            const rowHeight = 18;
            if (opts?.header) {
                doc
                    .fillColor('#0f766e')
                    .rect(32, y, pageWidth, rowHeight)
                    .fill();
                doc.fillColor('#ffffff');
            }
            else {
                doc.fillColor('#0f172a');
            }
            doc.fontSize(9);
            cells.forEach((c, i) => {
                doc.text(String(c ?? ''), 32 + i * colWidth + 4, y + 4, {
                    width: colWidth - 8,
                    ellipsis: true,
                });
            });
            doc.y = y + rowHeight;
            if (!opts?.header) {
                doc
                    .strokeColor('#cbd5e1')
                    .lineWidth(0.5)
                    .moveTo(32, doc.y)
                    .lineTo(32 + pageWidth, doc.y)
                    .stroke();
            }
        };
        drawRow(table.headers, { header: true });
        for (const row of table.rows) {
            if (doc.y > doc.page.height - 64) {
                doc.addPage();
            }
            drawRow(row);
        }
        if (totals) {
            doc.moveDown(0.6);
            doc.fillColor('#0f766e').fontSize(11);
            doc.text(`${totals.totalLabel}: ${totals.total.toFixed(3)} KD`, { align: 'right' });
        }
        doc.moveDown(1);
        doc.fillColor('#64748b').fontSize(8);
        doc.text(`Generated ${new Date().toISOString()} — Safari Omni Cloud ERP`, { align: 'center' });
        doc.end();
        return {
            stream,
            filename: `${title.replace(/\s+/g, '-').toLowerCase()}.pdf`,
        };
    }
};
exports.ExportsService = ExportsService;
exports.ExportsService = ExportsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [reports_service_1.ReportsService,
        attendance_service_1.AttendanceService,
        payroll_service_1.PayrollService,
        finance_service_1.FinanceService,
        inventory_service_1.InventoryService])
], ExportsService);
//# sourceMappingURL=exports.service.js.map