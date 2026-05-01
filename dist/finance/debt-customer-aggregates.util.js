"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCustomerNetDebtFromDebtLedgerAgg = getCustomerNetDebtFromDebtLedgerAgg;
exports.getCustomerDebtSnapshotTotalKd = getCustomerDebtSnapshotTotalKd;
const client_1 = require("@prisma/client");
const Z = () => new client_1.Prisma.Decimal(0);
async function getCustomerNetDebtFromDebtLedgerAgg(db, customerId) {
    const z = Z();
    const rows = await db.debtLedgerEntry.groupBy({
        by: ['source'],
        where: { customerId },
        _sum: { amount: true },
    });
    let inv = z;
    let sub = z;
    let pay = z;
    for (const r of rows) {
        const amt = new client_1.Prisma.Decimal(r._sum.amount?.toString() ?? '0');
        if (r.source === client_1.DebtSource.INVOICE_SHORTFALL)
            inv = inv.add(amt);
        else if (r.source === client_1.DebtSource.SUBSCRIPTION_OVERUSE)
            sub = sub.add(amt);
        else if (r.source === client_1.DebtSource.PAYMENT)
            pay = pay.add(amt);
    }
    const invPaid = inv.lessThanOrEqualTo(pay) ? inv : pay;
    const payAfterInv = pay.sub(invPaid);
    const subPaid = sub.lessThanOrEqualTo(payAfterInv) ? sub : payAfterInv;
    const remInv = inv.sub(invPaid);
    const remSub = sub.sub(subPaid);
    return {
        outstandingInvoiceDebtKd: remInv,
        outstandingSubscriptionDebtKd: remSub,
        netOpenDebtKd: remInv.add(remSub),
    };
}
async function getCustomerDebtSnapshotTotalKd(db, customerId) {
    const wallet = await db.customerWallet.findUnique({
        where: { customerId },
        select: { balance: true, debt: true },
    });
    const walletDebt = wallet?.debt ?? new client_1.Prisma.Decimal(0);
    const balance = wallet?.balance ?? new client_1.Prisma.Decimal(0);
    const subscriptionOveruseDebt = balance.lessThan(Z())
        ? balance.abs()
        : Z();
    return walletDebt.plus(subscriptionOveruseDebt);
}
//# sourceMappingURL=debt-customer-aggregates.util.js.map