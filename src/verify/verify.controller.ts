import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { VerifyService } from './verify.service';

/**
 * Public endpoints that back the QR stamped on every HR printout.
 *
 * Scanning the QR on an A4 payslip / attendance report / leave request
 * / loan acknowledgement hits one of these URLs and returns a minimal
 * JSON descriptor (document exists + who it was issued to + the
 * headline numbers printed on the page). No authentication required;
 * these routes deliberately return only what is already visible on
 * paper.
 *
 * Controller-level guards are intentionally omitted — auth in this
 * project is applied per-controller via @UseGuards, and leaving it
 * off here makes the endpoints publicly reachable by any QR scanner.
 *
 * NEW ROUTES ONLY — existing endpoints are unchanged.
 */
@ApiTags('verify')
@Controller('verify')
export class VerifyController {
  constructor(private readonly verify: VerifyService) {}

  @Get('payslip/:id')
  @ApiOperation({
    summary: 'Verify a printed payslip',
    description:
      'Stage-D — returns { valid, issuedTo, summary } for the payslip referenced by the QR on the printed A4 form. No secrets: only what the page already shows.',
  })
  verifyPayslip(@Param('id') id: string) {
    return this.verify.verifyPayslip(id);
  }

  @Get('leave_request/:id')
  @ApiOperation({
    summary: 'Verify a printed leave request',
    description:
      'Stage-D — returns { valid, issuedTo, summary } for the leave request referenced by the QR on the printed A4 form.',
  })
  verifyLeave(@Param('id') id: string) {
    return this.verify.verifyLeave(id);
  }

  @Get('employee_loan/:id')
  @ApiOperation({
    summary: 'Verify a printed employee loan',
    description:
      'Stage-D — returns { valid, issuedTo, summary } for the loan acknowledgement referenced by the QR on the printed A4 form.',
  })
  verifyLoan(@Param('id') id: string) {
    return this.verify.verifyLoan(id);
  }

  @Get('statement/:id')
  @ApiOperation({
    summary: 'Verify a printed customer statement',
    description:
      'V19.8.4 — returns { valid, issuedTo, summary } for the customer statement referenced by the QR at the bottom of the printed A4 page.',
  })
  verifyStatement(@Param('id') id: string) {
    return this.verify.verifyStatement(id);
  }

  @Get('debt_hold/:id')
  @ApiOperation({
    summary: 'Verify a printed debt-hold voucher',
    description:
      'V19.17 — returns { valid, issuedTo, summary } for the debt-hold voucher (تحرير/صرف) referenced by the QR at the bottom of the A4 voucher. No secrets exposed: only the stage + amounts + employee already printed on the page.',
  })
  verifyDebtHold(@Param('id') id: string) {
    return this.verify.verifyDebtHold(id);
  }

  @Get('cash_receipt/:id')
  @ApiOperation({
    summary: 'Verify a printed driver cash-handover receipt',
    description:
      'V19.17 — returns { valid, issuedTo, summary } for the formal cash handover receipt (سند استلام كاش) the manager issued to a driver. The QR at the bottom of the A4 voucher encodes the ManagerCashCustody row UUID.',
  })
  verifyCashReceipt(@Param('id') id: string) {
    return this.verify.verifyCashReceipt(id);
  }

  /**
   * V19.21 — verify the QR stamped on a printed monthly payroll
   * roster. The `token` param is the text embedded in the QR at
   * print time: `YYYY-MM` for an unscoped roster or
   * `YYYY-MM_<branchId>` for a branch-scoped one. Returns the same
   * aggregate totals that were printed on the sheet so an auditor
   * can confirm the run against the live DB with one scan.
   */
  @Get('payroll_roster/:token')
  @ApiOperation({
    summary: 'Verify a printed monthly payroll roster',
    description:
      'V19.21 — returns { valid, issuedTo, summary } for the monthly payroll roster (مسير الرواتب الشهري). Token is "YYYY-MM" or "YYYY-MM_<branchId>". Summary fields mirror the printed totals; no per-employee detail is exposed.',
  })
  verifyPayrollRoster(@Param('token') token: string) {
    return this.verify.verifyPayrollRoster(token);
  }
}
