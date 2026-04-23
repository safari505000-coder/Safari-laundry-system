import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { ManagerDocumentsService } from './manager-documents.service';

/**
 * V19.22.5 — Branch Manager "My Documents" island.
 * Controller:
 *   GET /api/manager/my-documents            — unified list
 *   GET /api/manager/my-documents/expense/:id — single expense
 *                                               voucher payload for
 *                                               the printable page
 *
 * RBAC: MANAGER only (OWNER bypasses via global guard). Each row is
 * scoped to the caller's userId + branchId so a manager can never
 * print another manager's file.
 */
@ApiTags('manager-documents')
@ApiBearerAuth('bearer')
@Controller('manager/my-documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ManagerDocumentsController {
  constructor(private readonly svc: ManagerDocumentsService) {}

  @Get()
  @Roles(SafariRole.MANAGER)
  @ApiOperation({
    summary: `Branch Manager — my documents (${APP_BRAND})`,
    description:
      'Unified chronological feed of Accountant-approved documents owned by the signed-in manager: CUSTODY_RECEIPT (VERIFIED cash-handover bags) + EXPENSE_VOUCHER (APPROVED branch expenses attached to this manager or their branch). Each row carries a `printPath` the FE navigates to for the printable document.',
  })
  list(@CurrentUser() user: JwtUser) {
    return this.svc.listForManager(user.userId, user.branchId);
  }

  @Get('expense/:id')
  @Roles(SafariRole.MANAGER)
  @ApiOperation({
    summary: `Branch Manager — expense voucher (${APP_BRAND})`,
    description:
      'Fetch a single APPROVED BranchExpense row for the printable voucher. The manager must either be the original submitter OR the expense must be booked on their branch; otherwise 404 is returned.',
  })
  async getExpenseVoucher(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    const row = await this.svc.getExpenseVoucherForManager(
      id,
      user.userId,
      user.branchId,
    );
    if (!row) {
      throw new NotFoundException(
        'Voucher not found or you do not have access.',
      );
    }
    return {
      id: row.id,
      title: row.title,
      amountKd: row.amount.toString(),
      category: row.category,
      expenseMethod: row.expenseMethod,
      note: row.note,
      expenseDate: row.expenseDate.toISOString(),
      approvedAt: row.updatedAt.toISOString(),
      status: row.status,
      recordedBy: {
        id: row.recordedBy.id,
        fullName: row.recordedBy.fullName,
        username: row.recordedBy.username,
      },
      branch: row.branch ? { id: row.branch.id, name: row.branch.name } : null,
    };
  }
}
