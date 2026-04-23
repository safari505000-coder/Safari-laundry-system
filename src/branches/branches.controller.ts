import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
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
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({
    summary: `List branches (${APP_BRAND})`,
    description:
      'OWNER / GENERAL_MANAGER use this for the branch switcher on reports and for the branch picker in the user-management dialog.',
  })
  list() {
    return this.branchesService.listAll();
  }

  @Post()
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Create branch (${APP_BRAND})`,
    description:
      'OWNER and GENERAL_MANAGER only. New branches appear in the branch switcher when active.',
  })
  create(@Body() dto: CreateBranchDto) {
    return this.branchesService.create(dto);
  }

  /**
   * V19.21 — partial branch update. OWNER / GM only to match the
   * `POST /` trust boundary. Validated via `UpdateBranchDto` so the
   * same trim / length caps apply to whichever fields were sent.
   */
  @Patch(':id')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Update branch (${APP_BRAND})`,
    description:
      'OWNER and GENERAL_MANAGER only. Only the fields present in the body are written — omitted fields stay unchanged.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branchesService.update(id, dto);
  }

  @Get('operations-live')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Branch live ops flags (${APP_BRAND})`,
    description:
      'OWNER only. True when the branch has at least one in-flight order (not COMPLETED/CANCELED) on a driver assigned to that branch.',
  })
  operationsLive() {
    return this.branchesService.operationsLiveByBranch();
  }
}
