import { Logger } from '@nestjs/common';

/**
 * V20.4 — Phase 7 transitional-mode deprecation warning.
 *
 * Logs a clear, structured deprecation notice at boot when the
 * V20.4 master flag is OFF (i.e., the deployment is still
 * running in V20.2/V20.3 hybrid mode). The notice is loud
 * enough to land on every operator's startup-logs dashboard
 * but never fails the boot — the system stays backwards
 * compatible until operators flip `V20_4_FINAL_LEDGER=true`.
 *
 * The warning includes:
 *   • The current values of the three migration flags.
 *   • The recommended pre-flip checklist (run reconciliation,
 *     verify drift = 0, confirm subscription-cancel test).
 *   • A clear pointer to the `/api/finance/reconciliation/run`
 *     endpoint operators should hit before flipping.
 */
export function warnIfV20_4HybridMode(logger: Logger = new Logger('V20.4')): void {
  const masterOn = isFlagOn('V20_4_FINAL_LEDGER');
  if (masterOn) {
    logger.log(
      '[V20_4_FINAL_LEDGER=ON] Canonical banking core enforced — journal is the single source of truth.',
    );
    return;
  }

  const v203 = isFlagOn('V20_3_TRUE_ACCOUNTING');
  const journal = isFlagOn('USE_JOURNAL_AS_SOURCE');

  logger.warn(
    `[V20_4_HYBRID_MODE_ACTIVE] V20_4_FINAL_LEDGER is OFF. ` +
      `Current sub-flags: V20_3_TRUE_ACCOUNTING=${v203 ? 'on' : 'off'}, ` +
      `USE_JOURNAL_AS_SOURCE=${journal ? 'on' : 'off'}. ` +
      `System remains in V20.2/V20.3 transitional mode — ` +
      `legacy DebtLedger waterfall and wallet.debt fallbacks still drive some reads. ` +
      `To finalise: ` +
      `(1) GET /api/finance/reconciliation/run, ` +
      `(2) confirm driftCount=0, ` +
      `(3) set V20_4_FINAL_LEDGER=true and restart. ` +
      `Phase 7 of the V20.4 mission removes this transitional code path entirely; ` +
      `do not deploy a future major version with the master flag still off.`,
  );
}

function isFlagOn(name: string): boolean {
  const v = (process.env[name] ?? '').toString().trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}
