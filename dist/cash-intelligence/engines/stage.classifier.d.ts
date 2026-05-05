import { BankDepositStatus, ManagerCashCustodyStatus, ShiftStatus } from "@prisma/client";
import { CashV2Stage } from '../dto/cash-intelligence-analysis.dto';
export interface StageInputs {
    handoverShiftId: string | null;
    handoverShiftStatus: ShiftStatus | null;
    custodyId: string | null;
    custodyStatus: ManagerCashCustodyStatus | null;
    bankDepositId: string | null;
    bankDepositStatus: BankDepositStatus | null;
}
export declare function classifyStage(inputs: StageInputs): CashV2Stage;
