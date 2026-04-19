import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DebtTransfersService } from './debt-transfers.service';
import { CancelDebtTransferDto } from './dto/cancel-debt-transfer.dto';
import { CreateDebtTransferDto } from './dto/create-debt-transfer.dto';
import { ListDebtTransfersDto } from './dto/list-debt-transfers.dto';

/**
 * Dastur §5 — Debt Transfer REST surface.
 *
 * Role matrix:
 *   • GENERAL_MANAGER, ACCOUNTANT → full write access (create / finalize /
 *     cancel) and read access (list + detail).
 *   • OWNER → read-only (list + detail + driver outstanding lookup).
 *   • DRIVER → may sign ONLY their own half (source or target) of a
 *     specific transfer they appear on, and may read that one transfer.
 */
@ApiTags('debt-transfers')
@ApiBearerAuth('bearer')
@Controller('debt-transfers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DebtTransfersController {
  constructor(private readonly service: DebtTransfersService) {}

  /* ── Queries (GM + ACCOUNTANT + OWNER) ──────────────────────────────── */

  @Get()
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({
    summary: 'List debt transfers with filtering (OWNER read-only, GM/ACC full).',
  })
  list(@Query() query: ListDebtTransfersDto) {
    return this.service.list(query);
  }

  @Get('mine')
  @Roles(SafariRole.DRIVER)
  @ApiOperation({
    summary: 'Driver-facing view: transfers where I am source or target.',
  })
  mine(@CurrentUser() user: JwtUser) {
    return this.service.listMine(user.userId);
  }

  @Get('drivers')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({
    summary: 'Active DRIVER roster (for source/target pickers).',
  })
  listDrivers() {
    return this.service.listDrivers();
  }

  @Get('drivers/:driverId/outstanding')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({
    summary: 'List a driver\'s outstanding PAID_TO_DRIVER orders (transfer candidates).',
  })
  outstanding(@Param('driverId', ParseUUIDPipe) driverId: string) {
    return this.service.getDriverOutstandingOrders(driverId);
  }

  @Get(':id')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.DRIVER,
  )
  @ApiOperation({
    summary: 'Get a debt transfer by id. Driver can only read their own transfers.',
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    const transfer = await this.service.findOne(id);
    if (user.role === SafariRole.DRIVER) {
      if (
        transfer.sourceDriver?.id !== user.userId &&
        transfer.targetDriver?.id !== user.userId
      ) {
        // Driver not a participant — hide existence.
        throw new (await import('@nestjs/common')).NotFoundException(
          'Debt transfer not found.',
        );
      }
    }
    return transfer;
  }

  /* ── Mutations (GM + ACCOUNTANT) ────────────────────────────────────── */

  @Post()
  @Roles(SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Create a new debt transfer (GM or ACCOUNTANT only).' })
  create(
    @Body() dto: CreateDebtTransferDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.create(user.userId, user.role as SafariRole, dto);
  }

  @Post(':id/finalize')
  @Roles(SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Finalize a debt transfer (requires both driver signatures).',
  })
  finalize(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.finalize(id, user.userId, user.role as SafariRole);
  }

  @Post(':id/cancel')
  @Roles(SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Cancel a DRAFT or AWAITING_SIGNATURES debt transfer.' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelDebtTransferDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.cancel(
      id,
      user.userId,
      user.role as SafariRole,
      dto.reason ?? null,
    );
  }

  /* ── Signatures (DRIVER only — the one named on the document) ───────── */

  @Post(':id/sign/source')
  @Roles(SafariRole.DRIVER)
  @ApiOperation({
    summary:
      'Source driver signs (acknowledges releasing the debt to the target).',
  })
  signSource(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.signAsSource(id, user.userId);
  }

  @Post(':id/sign/target')
  @Roles(SafariRole.DRIVER)
  @ApiOperation({
    summary: 'Target driver signs (accepts receipt of the debt).',
  })
  signTarget(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.signAsTarget(id, user.userId);
  }
}
