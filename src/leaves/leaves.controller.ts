import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import {
  CreateLeaveDto,
  RejectLeaveDto,
} from './dto/create-leave.dto';
import { ListLeavesQueryDto } from './dto/list-leaves-query.dto';
import { LeavesService } from './leaves.service';

/**
 * Stage-D leave request endpoints (DUSTUR §D.4).
 *
 *   POST   /api/leaves              — employee submits a request
 *   GET    /api/leaves              — list (approvers see all, employees see own)
 *   GET    /api/leaves/mine         — employee inbox
 *   GET    /api/leaves/:id          — single row (employee may read own)
 *   PATCH  /api/leaves/:id/approve  — approver approves
 *   PATCH  /api/leaves/:id/reject   — approver rejects (requires reason)
 *   PATCH  /api/leaves/:id/cancel   — employee cancels own PENDING request
 */
@ApiTags('leaves')
@ApiBearerAuth('bearer')
@Controller('leaves')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeavesController {
  constructor(private readonly leaves: LeavesService) {}

  @Post()
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.DRIVER,
    SafariRole.CALL_CENTER,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({ summary: `Submit a leave request (${APP_BRAND})` })
  create(@Body() dto: CreateLeaveDto, @CurrentUser() user: JwtUser) {
    return this.leaves.create(user.userId, dto);
  }

  @Get()
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({ summary: `List leave requests (${APP_BRAND})` })
  list(@Query() q: ListLeavesQueryDto, @CurrentUser() user: JwtUser) {
    return this.leaves.list(user.role as SafariRole, user.userId, q);
  }

  @Get('mine')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.DRIVER,
    SafariRole.CALL_CENTER,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({ summary: `My leave requests (${APP_BRAND})` })
  mine(@CurrentUser() user: JwtUser) {
    return this.leaves.listMine(user.userId);
  }

  @Get(':id')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.DRIVER,
    SafariRole.CALL_CENTER,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({ summary: `Fetch single leave row (${APP_BRAND})` })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.leaves.findOne(user.role as SafariRole, user.userId, id);
  }

  @Patch(':id/approve')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({ summary: `Approve a leave request (${APP_BRAND})` })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.leaves.approve(user.role as SafariRole, user.userId, id);
  }

  @Patch(':id/reject')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({ summary: `Reject a leave request (${APP_BRAND})` })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectLeaveDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.leaves.reject(
      user.role as SafariRole,
      user.userId,
      id,
      dto.reason,
    );
  }

  @Patch(':id/cancel')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.DRIVER,
    SafariRole.CALL_CENTER,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({ summary: `Cancel own pending leave request (${APP_BRAND})` })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.leaves.cancel(user.userId, id);
  }
}
