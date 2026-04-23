import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommissionMode, SafariRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { CommissionRulesService } from './commission-rules.service';
import { CreateCommissionRuleDto } from './dto/create-commission-rule.dto';
import { UpdateCommissionRuleDto } from './dto/update-commission-rule.dto';

@ApiTags('commission-rules')
@ApiBearerAuth('bearer')
@Controller('commission-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommissionRulesController {
  constructor(private readonly service: CommissionRulesService) {}

  @Get()
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({ summary: `List commission rules (${APP_BRAND})` })
  list(@CurrentUser() user: JwtUser, @Query('mode') mode?: CommissionMode) {
    return this.service.list(user.role as SafariRole, { mode });
  }

  @Get('default')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Fetch the dashboard "default" rule (role = null) (${APP_BRAND})`,
  })
  getDefault(@CurrentUser() user: JwtUser) {
    return this.service.getDefaultRule(user.role as SafariRole);
  }

  @Put('default')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Upsert the dashboard "default" rule (role = null) (${APP_BRAND})`,
  })
  upsertDefault(
    @Body() dto: CreateCommissionRuleDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.upsertDefaultRule(user.role as SafariRole, dto);
  }

  @Get(':id')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({ summary: `Fetch a commission rule (${APP_BRAND})` })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.findOne(user.role as SafariRole, id);
  }

  @Post()
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({ summary: `Create a commission rule (${APP_BRAND})` })
  create(
    @Body() dto: CreateCommissionRuleDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.create(user.role as SafariRole, dto);
  }

  @Patch(':id')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({ summary: `Update a commission rule (${APP_BRAND})` })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommissionRuleDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(user.role as SafariRole, id, dto);
  }

  @Delete(':id')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Soft-disable a commission rule (${APP_BRAND})`,
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.remove(user.role as SafariRole, id);
  }
}
