"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cashStatusForPaymentMethod = cashStatusForPaymentMethod;
exports.isElectronicMethod = isElectronicMethod;
const client_1 = require("@prisma/client");
function cashStatusForPaymentMethod(method) {
    switch (method) {
        case client_1.PosPaymentMethod.KNET:
        case client_1.PosPaymentMethod.PAYMENT_LINK:
        case client_1.PosPaymentMethod.ONLINE:
            return client_1.CashStatus.PAID_ONLINE;
        case client_1.PosPaymentMethod.CASH:
        case client_1.PosPaymentMethod.DEBT_ON_ACCOUNT:
        case client_1.PosPaymentMethod.SUBSCRIPTION_WALLET:
        default:
            return client_1.CashStatus.PAID_TO_DRIVER;
    }
}
function isElectronicMethod(method) {
    return (method === client_1.PosPaymentMethod.KNET ||
        method === client_1.PosPaymentMethod.PAYMENT_LINK ||
        method === client_1.PosPaymentMethod.ONLINE);
}
//# sourceMappingURL=cash-status-for-method.js.map