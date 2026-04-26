"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLES_THAT_SEE_ADMINISTRATIVE_BRANCHES = void 0;
exports.canSeeAdministrativeBranches = canSeeAdministrativeBranches;
exports.assertBranchOperationalForCommerce = assertBranchOperationalForCommerce;
exports.assertUserNotOnAdministrativeBranchForSales = assertUserNotOnAdministrativeBranchForSales;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
exports.ROLES_THAT_SEE_ADMINISTRATIVE_BRANCHES = [
    client_1.SafariRole.OWNER,
    client_1.SafariRole.GENERAL_MANAGER,
    client_1.SafariRole.ACCOUNTANT,
];
function canSeeAdministrativeBranches(role) {
    return exports.ROLES_THAT_SEE_ADMINISTRATIVE_BRANCHES.includes(role);
}
async function assertBranchOperationalForCommerce(prisma, branchId) {
    const b = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { isAdministrative: true },
    });
    if (!b) {
        throw new common_1.NotFoundException('Branch not found');
    }
    if (b.isAdministrative) {
        throw new common_1.BadRequestException('This branch is administrative-only: sales, purchase orders, and POS are disabled.');
    }
}
async function assertUserNotOnAdministrativeBranchForSales(prisma, userId) {
    const u = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            branchId: true,
            branch: { select: { isAdministrative: true } },
        },
    });
    if (!u) {
        throw new common_1.NotFoundException('User not found');
    }
    if (u.branchId && u.branch?.isAdministrative) {
        throw new common_1.BadRequestException('Orders and POS are not allowed for users assigned to the administrative branch.');
    }
}
//# sourceMappingURL=administrative-branch.util.js.map