"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAccountantDashboardTestContext = createAccountantDashboardTestContext;
exports.insertCompletedCashOrder = insertCompletedCashOrder;
exports.insertCustodyHandover = insertCustodyHandover;
exports.insertApprovedExpense = insertApprovedExpense;
const crypto_1 = require("crypto");
const bcrypt = __importStar(require("bcrypt"));
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("@prisma/client");
const pg_1 = require("pg");
function requireTestDbUrl() {
    const url = process.env.ACCOUNTANT_DASHBOARD_TEST_DATABASE_URL?.trim();
    if (!url) {
        throw new Error('Set ACCOUNTANT_DASHBOARD_TEST_DATABASE_URL to run accountant dashboard integration tests.');
    }
    return url;
}
async function createAccountantDashboardTestContext() {
    const url = requireTestDbUrl();
    const pool = new pg_1.Pool({ connectionString: url });
    const prisma = new client_1.PrismaClient({ adapter: new adapter_pg_1.PrismaPg(pool) });
    await prisma.$connect();
    const runId = (0, crypto_1.randomUUID)().slice(0, 8);
    const suffix = `acct-${runId}`;
    const hash = await bcrypt.hash('test-pass', 4);
    const driverRole = await prisma.role.findFirst({
        where: { name: client_1.SafariRole.DRIVER },
    });
    const managerRole = await prisma.role.findFirst({
        where: { name: client_1.SafariRole.MANAGER },
    });
    const accountantRole = await prisma.role.findFirst({
        where: { name: client_1.SafariRole.ACCOUNTANT },
    });
    if (!driverRole || !managerRole || !accountantRole) {
        await prisma.$disconnect();
        await pool.end();
        throw new Error('Seed roles DRIVER / MANAGER / ACCOUNTANT missing — run prisma db seed on the test database first.');
    }
    const branch = await prisma.branch.create({
        data: {
            name: `Branch ${suffix}`,
            location: 'Test',
            phone: `90000${runId.slice(0, 4)}`,
        },
    });
    const driverA = await prisma.user.create({
        data: {
            username: `${suffix}-drv-a`,
            password: hash,
            fullName: 'Driver A Integration',
            safariRole: client_1.SafariRole.DRIVER,
            roleId: driverRole.id,
            branchId: branch.id,
        },
    });
    const driverB = await prisma.user.create({
        data: {
            username: `${suffix}-drv-b`,
            password: hash,
            fullName: 'Driver B Integration',
            safariRole: client_1.SafariRole.DRIVER,
            roleId: driverRole.id,
            branchId: branch.id,
        },
    });
    const manager = await prisma.user.create({
        data: {
            username: `${suffix}-mgr`,
            password: hash,
            fullName: 'Manager Integration',
            safariRole: client_1.SafariRole.MANAGER,
            roleId: managerRole.id,
            branchId: branch.id,
        },
    });
    const accountant = await prisma.user.create({
        data: {
            username: `${suffix}-acct`,
            password: hash,
            fullName: 'Accountant Integration',
            safariRole: client_1.SafariRole.ACCOUNTANT,
            roleId: accountantRole.id,
            branchId: branch.id,
        },
    });
    const customer = await prisma.customer.create({
        data: {
            phone: `50000${runId.slice(0, 5)}`,
            displayName: `Cust ${suffix}`,
            originBranchId: branch.id,
        },
    });
    const ctx = {
        prisma,
        pool,
        runId,
        branchId: branch.id,
        managerId: manager.id,
        driverAId: driverA.id,
        driverBId: driverB.id,
        customerId: customer.id,
        accountantId: accountant.id,
        dispose: async () => {
            const orders = await prisma.order.findMany({
                where: { customerId: customer.id },
                select: { id: true },
            });
            const oids = orders.map((o) => o.id);
            if (oids.length > 0) {
                await prisma.generalLedgerEntry.deleteMany({
                    where: { orderId: { in: oids } },
                });
            }
            await prisma.order.deleteMany({
                where: { customerId: customer.id },
            });
            await prisma.branchExpense.deleteMany({
                where: { branchId: branch.id },
            });
            await prisma.managerCashCustody.deleteMany({
                where: { branchId: branch.id },
            });
            await prisma.customer.delete({ where: { id: customer.id } }).catch(() => undefined);
            await prisma.user.deleteMany({
                where: {
                    id: {
                        in: [driverA.id, driverB.id, manager.id, accountant.id],
                    },
                },
            });
            await prisma.branch.delete({ where: { id: branch.id } }).catch(() => undefined);
            await prisma.$disconnect();
            await pool.end();
        },
    };
    return ctx;
}
async function insertCompletedCashOrder(ctx, p) {
    const order = await ctx.prisma.order.create({
        data: {
            customerId: ctx.customerId,
            driverId: p.driverId,
            status: client_1.OrderStatus.COMPLETED,
            posPaymentMethod: client_1.PosPaymentMethod.CASH,
            cashStatus: p.cashStatus ?? client_1.CashStatus.PAID_TO_DRIVER,
            totalPrice: p.totalPrice,
            completedAt: p.completedAt,
        },
    });
    return order.id;
}
async function insertCustodyHandover(ctx, p) {
    const row = await ctx.prisma.managerCashCustody.create({
        data: {
            managerId: ctx.managerId,
            driverId: p.driverId,
            branchId: ctx.branchId,
            amountKd: p.amountKd,
            status: p.status ?? client_1.ManagerCashCustodyStatus.PENDING_DEPOSIT,
            receivedFromDriverAt: p.receivedFromDriverAt,
            slipUploadedAt: p.slipUploadedAt ?? undefined,
        },
    });
    return row.id;
}
async function insertApprovedExpense(ctx, p) {
    await ctx.prisma.branchExpense.create({
        data: {
            title: `Expense ${ctx.runId}`,
            amount: p.amount,
            category: client_1.ExpenseCategory.MISC,
            status: client_1.ExpenseStatus.APPROVED,
            recordedById: ctx.accountantId,
            branchId: ctx.branchId,
            expenseDate: p.expenseDate,
        },
    });
}
//# sourceMappingURL=accountant-dashboard-integration-context.js.map