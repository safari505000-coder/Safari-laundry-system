import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/roles.decorator';
import { deploymentColor, deploymentRegion } from '../common/config/region';
import { APP_VERSION } from '../common/constants/app-version';
import { APP_BRAND } from '../common/constants/branding';

/**
 * V19.3 — public `/api/version` endpoint.
 *
 * Returns the minimum build-identity payload a canary harness, ops
 * dashboard, or rollback script needs to answer the question "which
 * commit is currently live?" without reaching for a shell.
 *
 * Intentionally public (no JWT) so UptimeRobot / BetterStack / ALB
 * target-group checks can differentiate between a deploy that went out
 * and one that did not. No business data is ever in the payload:
 *   • name      — product brand string
 *   • version   — package.json version (the release tag)
 *   • gitCommit — CI-injected short SHA (env GIT_COMMIT|BUILD_SHA),
 *                 falls back to "unknown" when not supplied
 *   • buildTime — CI-injected ISO timestamp (env BUILD_TIME),
 *                 falls back to "unknown"
 *   • node      — runtime process.version
 *   • env       — NODE_ENV
 *   • uptime    — seconds since the Nest process started
 *   • startedAt — ISO timestamp of process boot (computed from uptime)
 */
@ApiTags('version')
@Controller('version')
@Public('Deployment version endpoint contains only build identity metadata.')
export class VersionController {
  private readonly startedAtMs: number = Date.now();

  @Get()
  @ApiOperation({
    summary: `Build identity (${APP_BRAND})`,
    description:
      'Returns name, version, git commit, build time, Node.js runtime ' +
      'version, environment, uptime (seconds) and boot timestamp. ' +
      'Public — no auth — so deployment verifiers and load-balancer ' +
      'health targets can compare the live build to the expected one.',
  })
  get() {
    return {
      name: APP_BRAND,
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      gitCommit:
        process.env.GIT_COMMIT ??
        process.env.BUILD_SHA ??
        'unknown',
      buildTime: process.env.BUILD_TIME ?? 'unknown',
      node: process.version,
      env: process.env.NODE_ENV ?? 'development',
      uptime: Math.round(process.uptime()),
      startedAt: new Date(this.startedAtMs).toISOString(),
      region: deploymentRegion(),
      deploymentColor: deploymentColor(),
    };
  }
}
