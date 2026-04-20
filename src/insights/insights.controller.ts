import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { InsightsQueryDto } from './dto/insights-query.dto';
import { InsightsService } from './insights.service';
import { WeeklyExecutiveReportService } from './weekly-executive-report.service';

/**
 * Stage-C — public surface for the AI analytics dashboard. The
 * controller only shapes the HTTP envelope; all the number crunching
 * happens inside `InsightsService`. Endpoints are read-only for the
 * finance viewers (forecast / anomalies / scorecard) and the weekly
 * executive PDF download is exec-pair only.
 */
@ApiTags('insights')
@ApiBearerAuth('bearer')
@Controller('insights')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InsightsController {
  constructor(
    private readonly insights: InsightsService,
    private readonly weekly: WeeklyExecutiveReportService,
  ) {}

  @Get('cash-forecast')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({
    summary: 'Daily cash-flow forecast (revenue vs expenses)',
    description:
      'Returns a day-by-day historical series and a moving-average/day-of-week forecast for the configured horizon. Amounts are KD, anchored to Asia/Kuwait calendar days.',
  })
  async cashForecast(@Query() q: InsightsQueryDto) {
    const horizon = q.days ?? 30;
    const lookback = Math.max(horizon * 2, 60);
    return this.insights.cashForecast(lookback, horizon);
  }

  @Get('anomalies')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({
    summary: 'Detect abnormal daily revenue / expense days (Z-score)',
    description:
      'Flags revenue and expense buckets outside ±2σ of the configured window. Useful for early-warning alerts on the owner control panel.',
  })
  async anomalies(@Query() q: InsightsQueryDto) {
    return this.insights.detectAnomalies(q.days ?? 30, 2);
  }

  @Get('driver-scorecard')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
  )
  @ApiOperation({
    summary: 'Driver performance leaderboard (composite 0-100 score)',
    description:
      'Combines completed trips (40%), revenue per trip (30%), and inverted average turnaround hours (30%) into a single 0-100 score.',
  })
  async driverScorecard(@Query() q: InsightsQueryDto) {
    return this.insights.driverScorecard(q.days ?? 30);
  }

  // ─── Weekly Executive Report (PDF) ────────────────────────────────

  @Get('executive/weekly')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: 'List archived weekly executive reports',
    description:
      'Returns the reverse-chronological catalog of generated weekly PDFs (ISO-week key + size + generation timestamp).',
  })
  listWeekly() {
    return this.weekly.listArchive();
  }

  @Post('executive/weekly/regenerate')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: 'Regenerate the latest weekly executive PDF on demand',
  })
  async regenerateWeekly() {
    const entry = await this.weekly.generateLatest();
    return entry;
  }

  @Get('executive/weekly/:key')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: 'Download an archived weekly executive PDF',
    description:
      "Key format is `YYYY-W##` (e.g. `2026-W16`). The special key `latest` returns the most recent report, regenerating it if missing.",
  })
  async downloadWeekly(
    @Param('key') key: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, filename } = await this.weekly.openReport(key);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    return new StreamableFile(stream);
  }
}
