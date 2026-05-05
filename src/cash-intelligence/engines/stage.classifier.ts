/**
 * Step 5 — Current Location (Flow Stage Classifier).
 *
 * Walks the canonical chain:
 *   Order → Payment → Driver → Handover → Custody → Verified → Deposit → Bank
 *
 * The classifier is purely positional: it reads the linked-id presence
 * and lifecycle status of the chain entities (Shift, ManagerCashCustody,
 * BankDepositLog) and returns the FURTHEST stage we have evidence for.
 * It never compares amounts and never decides whether a stage is
 * "delayed" — that is the anomaly-detector's job.
 *
 * Authoritative source per stage:
 *   DRIVER           — order.handoverShiftId IS NULL
 *   DRIVER_HANDOVER  — handover shift exists AND status=CLOSED, no custody yet
 *   CUSTODY          — ManagerCashCustody row exists, status=PENDING_DEPOSIT|AWAITING_VERIFICATION
 *   VERIFIED         — ManagerCashCustody.status=VERIFIED, no BankDepositLog yet
 *   DEPOSIT          — BankDepositLog row exists, status=PENDING
 *   BANK             — BankDepositLog.status=VERIFIED
 */
import {
  BankDepositStatus,
  ManagerCashCustodyStatus,
  ShiftStatus,
} from '@prisma/client';
import { CashV2Stage } from '../dto/cash-intelligence-analysis.dto';

export interface StageInputs {
  handoverShiftId: string | null;
  handoverShiftStatus: ShiftStatus | null;
  custodyId: string | null;
  custodyStatus: ManagerCashCustodyStatus | null;
  bankDepositId: string | null;
  bankDepositStatus: BankDepositStatus | null;
}

export function classifyStage(inputs: StageInputs): CashV2Stage {
  // Walk the chain backwards: the farthest evidence wins.
  if (inputs.bankDepositStatus === BankDepositStatus.VERIFIED) {
    return 'BANK';
  }
  if (inputs.bankDepositId) {
    return 'DEPOSIT';
  }
  if (inputs.custodyStatus === ManagerCashCustodyStatus.VERIFIED) {
    return 'VERIFIED';
  }
  if (inputs.custodyId) {
    return 'CUSTODY';
  }
  if (
    inputs.handoverShiftId &&
    inputs.handoverShiftStatus === ShiftStatus.CLOSED
  ) {
    return 'DRIVER_HANDOVER';
  }
  return 'DRIVER';
}
