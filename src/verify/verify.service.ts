import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Public document-verification service.
 *
 * Every HR printout (payslip, attendance, leave request, loan) carries
 * a QR that points at one of these endpoints. Returning a minimal
 * JSON payload (no sensitive details, just what is already printed
 * on the page) lets an auditor confirm authenticity without needing a
 * login.
 *
 * Sensitive fields (salary breakdown, private notes) are never
 * exposed here — the QR is for "does this document exist and match
 * what is printed" checks only.
 */
export type VerifyResult = {
  docType: 'payslip' | 'attendance_report' | 'leave_request' | 'employee_loan';
  docId: string;
  valid: boolean;
  issuedAtIso: string;
  issuedTo: {
    fullName: string;
    username: string;
    employeeId: string | null;
  };
  summary: Record<string, string | number | null>;
};

@Injectable()
export class VerifyService {
  constructor(private readonly prisma: PrismaService) {}

  async verifyPayslip(id: string): Promise<VerifyResult> {
    const row = await this.prisma.payroll.findUnique({
      where: { id },
      include: {
        user: {
          select: { fullName: true, username: true, employeeId: true },
        },
        branch: { select: { name: true } },
      },
    });
    if (!row) throw new NotFoundException('Payslip not found');
    const net = row.basicSalary.add(row.allowances).sub(row.deductions);
    return {
      docType: 'payslip',
      docId: row.id,
      valid: true,
      issuedAtIso: row.createdAt.toISOString(),
      issuedTo: {
        fullName: row.user.fullName,
        username: row.user.username,
        employeeId: row.user.employeeId,
      },
      summary: {
        paymentDateIso: row.paymentDate.toISOString(),
        status: row.status,
        netPayKd: net.toFixed(3),
        branch: row.branch?.name ?? null,
      },
    };
  }
}
