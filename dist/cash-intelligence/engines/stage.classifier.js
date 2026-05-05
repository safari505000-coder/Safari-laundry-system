"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyStage = classifyStage;
const client_1 = require("@prisma/client");
function classifyStage(inputs) {
    if (inputs.bankDepositStatus === client_1.BankDepositStatus.VERIFIED) {
        return 'BANK';
    }
    if (inputs.bankDepositId) {
        return 'DEPOSIT';
    }
    if (inputs.custodyStatus === client_1.ManagerCashCustodyStatus.VERIFIED) {
        return 'VERIFIED';
    }
    if (inputs.custodyId) {
        return 'CUSTODY';
    }
    if (inputs.handoverShiftId &&
        inputs.handoverShiftStatus === client_1.ShiftStatus.CLOSED) {
        return 'DRIVER_HANDOVER';
    }
    return 'DRIVER';
}
//# sourceMappingURL=stage.classifier.js.map