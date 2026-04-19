"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeOrderBankFeeKd = computeOrderBankFeeKd;
const client_1 = require("@prisma/client");
function computeOrderBankFeeKd(grossKd, method, config) {
    const gross = new client_1.Prisma.Decimal(grossKd.toString());
    if (!method || method === client_1.PosPaymentMethod.CASH) {
        return new client_1.Prisma.Decimal(0);
    }
    if (method === client_1.PosPaymentMethod.SUBSCRIPTION_WALLET ||
        method === client_1.PosPaymentMethod.DEBT_ON_ACCOUNT) {
        return new client_1.Prisma.Decimal(0);
    }
    const knetFlat = new client_1.Prisma.Decimal(config.knetFlatKd.toString());
    const knetPct = new client_1.Prisma.Decimal(config.knetPercentOfGross.toString());
    const cardPct = new client_1.Prisma.Decimal(config.cardPercentOfGross.toString());
    if (method === client_1.PosPaymentMethod.KNET) {
        const percentPart = gross.mul(knetPct);
        switch (config.knetRule) {
            case client_1.KnetCommissionRule.FLAT_ONLY:
                return knetFlat;
            case client_1.KnetCommissionRule.PERCENT_ONLY:
                return percentPart;
            default:
                return knetFlat.gt(percentPart) ? knetFlat : percentPart;
        }
    }
    if (method === client_1.PosPaymentMethod.PAYMENT_LINK ||
        method === client_1.PosPaymentMethod.ONLINE) {
        return gross.mul(cardPct);
    }
    return new client_1.Prisma.Decimal(0);
}
//# sourceMappingURL=bank-fee.util.js.map