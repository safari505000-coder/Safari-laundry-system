/**
 * Pre-deploy migration resolver + BOM safety scan.
 *
 * Runs BEFORE `prisma migrate deploy` in the Docker CMD (see Dockerfile).
 *
 * Two responsibilities:
 *   1. Resolve any migration listed in RESOLVE_AS_ROLLED_BACK that is
 *      recorded as "failed" in `_prisma_migrations`. Lets migrate deploy
 *      proceed after a previous failure (P3009 recovery).
 *   2. Strip UTF-8 BOM (EF BB BF) from any .sql migration file in
 *      prisma/migrations. PostgreSQL rejects SQL files that start with
 *      a BOM with `syntax error at or near "\u{feff}"` (P3018 / 42601).
 *      Windows tooling (PowerShell Set-Content -Encoding UTF8) silently
 *      adds the BOM, so this guard catches new migrations authored on Windows.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

console.log('[pre-deploy] Starting…');

// --- 1. BOM safety scan --------------------------------------------------
function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

let bomStripped = 0;
for (const file of walk('prisma/migrations')) {
  if (!file.endsWith('.sql')) continue;
  const buf = fs.readFileSync(file);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    fs.writeFileSync(file, buf.subarray(3));
    console.log(`[pre-deploy] Stripped UTF-8 BOM: ${file}`);
    bomStripped++;
  }
}
console.log(`[pre-deploy] BOM scan complete (${bomStripped} file(s) cleaned).`);

// --- 2. Resolve any failed migration ------------------------------------
const RESOLVE_AS_ROLLED_BACK = [
  '20260515130000_commission_payout_journal_required',
];

for (const name of RESOLVE_AS_ROLLED_BACK) {
  console.log(`[pre-deploy] Attempting to resolve "${name}" as rolled-back…`);
  try {
    execSync(`npx prisma migrate resolve --rolled-back ${name}`, {
      stdio: 'inherit',
    });
    console.log(`[pre-deploy] ✓ Resolved failed migration: ${name}`);
  } catch (err) {
    // Prisma exits non-zero when the migration isn't in failed state
    // (already applied / already rolled back / never ran). That is the
    // healthy steady-state path on every deploy after the first recovery.
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[pre-deploy] "${name}" not in failed state, skipping. (${msg.split('\n')[0]})`);
  }
}

console.log('[pre-deploy] Done. Handing off to prisma migrate deploy.');
