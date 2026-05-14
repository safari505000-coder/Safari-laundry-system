/**
 * Pre-deploy migration resolver.
 *
 * Runs BEFORE `prisma migrate deploy` in the Docker CMD (see Dockerfile).
 * Any migration listed in RESOLVE_AS_ROLLED_BACK that is recorded as
 * "failed" in `_prisma_migrations` is resolved so that migrate deploy
 * can proceed.
 *
 * Why this exists: The Phase-3 CHECK constraint migration
 * (20260515130000_commission_payout_journal_required) failed in production
 * because legacy COLLECTION CommissionPayout rows had sourceJournalEntryId=NULL.
 * Once the migration is re-run with the data-cleanup prefix (Step 1 in the SQL
 * file), it will succeed and this resolve call becomes a safe no-op.
 * Remove this script after the first successful production deploy.
 */

import { execSync } from 'node:child_process';

const RESOLVE_AS_ROLLED_BACK = [
  '20260515130000_commission_payout_journal_required',
];

console.log('[pre-deploy] Starting migration resolver…');

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
    // We log and continue — the subsequent `migrate deploy` will fail
    // loudly if there's a real problem.
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[pre-deploy] "${name}" not in failed state, skipping. (${msg.split('\n')[0]})`);
  }
}

console.log('[pre-deploy] Done. Handing off to prisma migrate deploy.');
