import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import * as fs from 'node:fs';
import * as path from 'node:path';
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
export class VersionController {
  private readonly version: string;
  private readonly startedAtMs: number = Date.now();

  constructor() {
    this.version = readPackageVersion();
  }

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
      version: this.version,
      gitCommit:
        process.env.GIT_COMMIT ??
        process.env.BUILD_SHA ??
        'unknown',
      buildTime: process.env.BUILD_TIME ?? 'unknown',
      node: process.version,
      env: process.env.NODE_ENV ?? 'development',
      uptime: Math.round(process.uptime()),
      startedAt: new Date(this.startedAtMs).toISOString(),
    };
  }
}

/**
 * Read package.json once at module init. We resolve from the compiled
 * `dist/src/health/` path back to the project root, but also accept
 * ts-node / jest paths (dev) by walking up until package.json is found.
 */
function readPackageVersion(): string {
  let dir = __dirname;
  for (let hops = 0; hops < 6; hops++) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, 'utf8');
        const json = JSON.parse(raw) as { version?: string; name?: string };
        if (json.version) return json.version;
      } catch {
        /* fall through to parent */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return 'unknown';
}
