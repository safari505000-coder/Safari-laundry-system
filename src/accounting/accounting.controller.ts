import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../auth/permissions/permissions.decorator';
import { AppPermission } from '../auth/permissions/permissions.enum';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingReconciliationService } from './accounting-reconciliation.service';
import {
  AccountingReconciliationQueryDto,
  AccountingScopeType,
  AccountingTimelineQueryDto,
} from './dto/accounting-query.dto';

@ApiTags('accounting')
@ApiBearerAuth()
@Controller('accounting')
@Roles(
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.ACCOUNTANT,
  // V19.33 — Branch Manager dashboard read-only access. The handlers
  // below clamp `branchId` to the JWT's branch so a MANAGER can never
  // read another branch's data even if they hand-craft the query string.
  SafariRole.MANAGER,
)
@Permissions(AppPermission.VIEW_CASH)
export class AccountingController {
  constructor(
    private readonly reconciliation: AccountingReconciliationService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * For BRANCH_MANAGER callers, force `branchId` to the JWT branch and
   * pin scope to BRANCH (or DRIVER scoped *within* that branch). Returns
   * a sanitized scope object the service can trust without further
   * authorisation checks.
   */
  private async clampScopeForManager(
    user: JwtUser,
    incoming: {
      scopeType?: AccountingScopeType;
      branchId?: string;
      driverId?: string;
    },
  ): Promise<{
    scopeType: AccountingScopeType;
    branchId?: string;
    driverId?: string;
  }> {
    if (user.role !== SafariRole.MANAGER) {
      return {
        scopeType: incoming.scopeType ?? AccountingScopeType.ALL,
        branchId: incoming.branchId,
        driverId: incoming.driverId,
      };
    }
    if (!user.branchId) {
      throw new ForbiddenException(
        'Manager has no branchId on JWT — cannot scope branch view.',
      );
    }
    if (incoming.driverId) {
      const driver = await this.prisma.user.findUnique({
        where: { id: incoming.driverId },
        select: { branchId: true, safariRole: true },
      });
      if (
        !driver ||
        driver.safariRole !== SafariRole.DRIVER ||
        driver.branchId !== user.branchId
      ) {
        throw new BadRequestException(
          'driverId does not belong to your branch.',
        );
      }
      return {
        scopeType: AccountingScopeType.DRIVER,
        driverId: incoming.driverId,
      };
    }
    return {
      scopeType: AccountingScopeType.BRANCH,
      branchId: user.branchId,
    };
  }

  @Get('reconciliation')
  async getReconciliation(
    @Query() query: AccountingReconciliationQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    const scope = await this.clampScopeForManager(user, query);
    return this.reconciliation.computeCashReconciliation(query.date, scope);
  }

  @Get('timeline')
  async getTimeline(
    @Query() query: AccountingTimelineQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    const scope = await this.clampScopeForManager(user, query);
    return this.reconciliation.getCashTimeline({
      date: query.date,
      ...scope,
    });
  }

  @Get('discrepancies')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  getDiscrepancies() {
    return this.reconciliation.getDiscrepancies();
  }
}
