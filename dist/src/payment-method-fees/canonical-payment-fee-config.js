"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CANONICAL_PAYMENT_METHOD_FEE_CONFIG = void 0;
const client_1 = require("@prisma/client");
exports.CANONICAL_PAYMENT_METHOD_FEE_CONFIG = {
    knetFlatKd: new client_1.Prisma.Decimal('0.1000'),
    knetPercentOfGross: new client_1.Prisma.Decimal('0.015000'),
    knetRule: client_1.KnetCommissionRule.HIGHER_OF_FLAT_AND_PERCENT,
    cardPercentOfGross: new client_1.Prisma.Decimal('0.025000'),
};
//# sourceMappingURL=canonical-payment-fee-config.js.map