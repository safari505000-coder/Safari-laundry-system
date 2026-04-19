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
}
