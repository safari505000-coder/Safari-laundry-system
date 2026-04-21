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
  docType:
    | 'payslip'
    | 'attendance_report'
    | 'leave_request'
    | 'employee_loan'
    | 'statement';
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

  async verifyLeave(id: string): Promise<VerifyResult> {
    const row = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        user: {
          select: { fullName: true, username: true, employeeId: true },
        },
      },
    });
    if (!row) throw new NotFoundException('Leave request not found');
    return {
      docType: 'leave_request',
      docId: row.id,
      valid: true,
      issuedAtIso: row.createdAt.toISOString(),
      issuedTo: {
        fullName: row.user.fullName,
        username: row.user.username,
        employeeId: row.user.employeeId,
      },
      summary: {
        type: row.type,
        startDate: row.startDate.toISOString().slice(0, 10),
        endDate: row.endDate.toISOString().slice(0, 10),
        daysCount: row.daysCount,
        status: row.status,
      },
    };
  }

  /**
   * V19.8.4 — verify the digital stamp on a printed customer
   * statement (كشف حساب). `id` is the customer UUID embedded in the
   * QR at print time. We expose only the headline balance / debt /
   * active-subscription snapshot — the same numbers the printed page
   * already shows — so an auditor can cross-check authenticity without
   * seeing anything sensitive (no invoices, no transaction history).
   */
  async verifyStatement(id: string): Promise<VerifyResult> {
    const row = await this.prisma.customer.findUnique({
      where: { id },
      select: {
        id: true,
        displayName: true,
        phone: true,
        createdAt: true,
        wallet: {
          select: {
            balance: true,
            debt: true,
            subscriptionPlanName: true,
            subscriptionExpiresAt: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Customer not found');
    return {
      docType: 'statement',
      docId: row.id,
      valid: true,
      issuedAtIso: new Date().toISOString(),
      issuedTo: {
        fullName: row.displayName ?? '—',
        username: row.phone ?? '—',
        employeeId: null,
      },
      summary: {
        walletBalanceKd: row.wallet?.balance.toFixed(3) ?? '0.000',
        walletDebtKd: row.wallet?.debt.toFixed(3) ?? '0.000',
        activePlan: row.wallet?.subscriptionPlanName ?? null,
        activePlanExpiresIso:
          row.wallet?.subscriptionExpiresAt?.toISOString() ?? null,
      },
    };
  }

  async verifyLoan(id: string): Promise<VerifyResult> {
    const row = await this.prisma.employeeLoan.findUnique({
      where: { id },
      include: {
        user: {
          select: { fullName: true, username: true, employeeId: true },
        },
      },
    });
    if (!row) throw new NotFoundException('Loan not found');
    return {
      docType: 'employee_loan',
      docId: row.id,
      valid: true,
      issuedAtIso: row.createdAt.toISOString(),
      issuedTo: {
        fullName: row.user.fullName,
        username: row.user.username,
        employeeId: row.user.employeeId,
      },
      summary: {
        amountKd: row.amount.toFixed(3),
        installmentCount: row.installmentCount,
        monthlyDeductionKd: row.monthlyDeduction.toFixed(3),
        remainingKd: row.remaining.toFixed(3),
        status: row.status,
      },
    };
  }
}
