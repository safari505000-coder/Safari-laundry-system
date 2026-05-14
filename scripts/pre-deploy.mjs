/**
 * Pre-deploy migration resolver.
 *
 * Runs BEFORE `prisma migrate deploy` in the Render start command.
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

import { execSync } from 'child_process';

const RESOLVE_AS_ROLLED_BACK = [
  '20260515130000_commission_payout_journal_required',
];

for (const name of RESOLVE_AS_ROLLED_BACK) {
  try {
    execSync(`npx prisma migrate resolve --rolled-back ${name}`, {
      stdio: 'inherit',
    });
    console.log(`[pre-deploy] Resolved failed migration: ${name}`);
  } catch {
    // Migration not in failed state (already resolved or never ran) — safe to ignore.
    console.log(`[pre-deploy] ${name} not in failed state, skipping.`);
  }
}
