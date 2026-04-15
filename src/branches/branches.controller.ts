import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { CreateBranchDto } from './dto/create-branch.dto';
import { BranchesService } from './branches.service';

@ApiTags('branches')
@ApiBearerAuth('bearer')
@Controller('branches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  @Roles(
    SafariRole.OWNER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({
    summary: `List branches (${APP_BRAND})`,
    description: 'OWNER uses this for the branch switcher on reports.',
  })
  list() {
    return this.branchesService.listAll();
  }

  @Post()
  @Roles(SafariRole.OWNER)
  @ApiOperation({
    summary: `Create branch (${APP_BRAND})`,
    description: 'OWNER only. New branches appear in the branch switcher when active.',
  })
  create(@Body() dto: CreateBranchDto) {
    return this.branchesService.create(dto);
  }

  @Get('operations-live')
  @Roles(SafariRole.OWNER)
  @ApiOperation({
    summary: `Branch live ops flags (${APP_BRAND})`,
    description:
      'OWNER only. True when the branch has at least one in-flight order (not COMPLETED/CANCELED) on a driver assigned to that branch.',
  })
  operationsLive() {
    return this.branchesService.operationsLiveByBranch();
  }
}
