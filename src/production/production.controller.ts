import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  GarmentIntakeDto,
  ProductionDecisionDto,
  ReassignTaskDto,
} from './dto/production.dto';
import { ProductionService } from './production.service';

/**
 * Production oversight + control surface (MANAGER branch-scoped /
 * SUPERVISOR analytics / OWNER + GM all-branch). GENERAL_MANAGER is HTTP
 * read-only via the global guard, so it appears on GET routes only.
 * The customer-status route is exposed to Call Center as a sanitised,
 * blame-free view.
 */
@ApiTags('production')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('production')
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Get('board')
  @Roles(
    SafariRole.MANAGER,
    SafariRole.SUPERVISOR,
    SafariRole.GENERAL_MANAGER,
    SafariRole.OWNER,
  )
  @ApiOperation({ summary: 'Production board (branch-scoped for MANAGER)' })
  board(@CurrentUser() user: JwtUser) {
    return this.production.getBoard(user);
  }

  @Get('issues')
  @Roles(
    SafariRole.MANAGER,
    SafariRole.SUPERVISOR,
    SafariRole.GENERAL_MANAGER,
    SafariRole.OWNER,
  )
  @ApiOperation({ summary: 'Open garment issues queue' })
  issues(@CurrentUser() user: JwtUser) {
    return this.production.listIssues(user);
  }

  @Get('garments/:id/timeline')
  @Roles(
    SafariRole.MANAGER,
    SafariRole.SUPERVISOR,
    SafariRole.GENERAL_MANAGER,
    SafariRole.OWNER,
  )
  @ApiOperation({ summary: 'Full append-only garment timeline + issues' })
  garmentTimeline(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.production.getGarmentTimeline(user, id);
  }

  @Get('workers/:id/logs')
  @Roles(
    SafariRole.MANAGER,
    SafariRole.SUPERVISOR,
    SafariRole.GENERAL_MANAGER,
    SafariRole.OWNER,
  )
  @ApiOperation({ summary: 'Worker productivity logs' })
  workerLogs(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.production.getWorkerLogs(user, id);
  }

  @Get('owner/dashboard')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({ summary: 'Owner cross-branch production dashboard' })
  ownerDashboard(@CurrentUser() user: JwtUser) {
    return this.production.getOwnerDashboard(user);
  }

  @Get('orders/:orderId/customer-status')
  @Roles(
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.MANAGER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.OWNER,
  )
  @ApiOperation({ summary: 'Customer-safe production status for an order' })
  customerStatus(@Param('orderId') orderId: string) {
    return this.production.getCustomerOrderStatus(orderId);
  }

  @Post('garments')
  @HttpCode(HttpStatus.CREATED)
  @Roles(SafariRole.MANAGER, SafariRole.OWNER)
  @ApiOperation({ summary: 'Intake: create tracked garments for an order' })
  intake(@Body() dto: GarmentIntakeDto, @CurrentUser() user: JwtUser) {
    return this.production.intakeGarments(user, dto);
  }

  @Post('issues/:id/decision')
  @HttpCode(HttpStatus.OK)
  @Roles(SafariRole.MANAGER, SafariRole.OWNER)
  @ApiOperation({ summary: 'Manager / Owner decision on an open issue' })
  decision(
    @Param('id') id: string,
    @Body() dto: ProductionDecisionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.production.decideIssue(user, id, dto);
  }

  @Post('tasks/:id/reassign')
  @HttpCode(HttpStatus.OK)
  @Roles(SafariRole.MANAGER, SafariRole.OWNER)
  @ApiOperation({ summary: 'Reassign the worker designated for a garment stage' })
  reassign(
    @Param('id') id: string,
    @Body() dto: ReassignTaskDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.production.reassignTask(user, id, dto);
  }
}
