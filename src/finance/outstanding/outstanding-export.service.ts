import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PassThrough, Readable } from 'node:stream';
import type { JwtUser } from '../../auth/decorators/current-user.decorator';
import { OutstandingQueryDto } from './dto/outstanding-query.dto';
import { OutstandingService } from './outstanding.service';

const STATUS_LABEL: Record<string, string> = {
  NORMAL: 'عادي',
  LATE: 'متأخر',
  RISK: 'خطر',
};

/**
 * V19.x — Excel exporter for the Outstanding-Payments view.
 * Reuses {@link OutstandingService.listOutstanding} so the workbook
 * is a 1-for-1 mirror of the on-screen table (same filters, same
 * totals). Returns a `Readable` so the controller can pipe it through
 * a Nest `StreamableFile`.
 */
@Injectable()
export class OutstandingExportService {
  constructor(private readonly outstanding: OutstandingService) {}

  async toXlsx(
    query: OutstandingQueryDto,
    actor?: JwtUser | null,
  ): Promise<{ stream: Readable; filename: string }> {
    const data = await this.outstanding.listOutstanding(query, actor);
    const wb = new ExcelJS.Workbook();
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
    const windowLabel =
      data.fromIso.slice(0, 10) === '1970-01-01'
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
    const stream = new PassThrough();
    stream.end(Buffer.from(buffer));
    return {
      stream,
      filename: `outstanding-${data.toIso.slice(0, 10)}.xlsx`,
    };
  }

  private styleHeader(ws: ExcelJS.Worksheet, rowIdx: number): void {
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
}
