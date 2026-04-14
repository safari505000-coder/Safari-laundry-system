"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertLineItemsMatchTotal = assertLineItemsMatchTotal;
const common_1 = require("@nestjs/common");
const MONEY_EPS = 0.005;
function assertLineItemsMatchTotal(totalPrice, lineItems) {
    if (!lineItems.length) {
        return;
    }
    const computed = lineItems.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    if (!Number.isFinite(computed) || !Number.isFinite(totalPrice)) {
        throw new common_1.BadRequestException('Invalid numeric values in line items or total');
    }
    if (Math.abs(computed - totalPrice) > MONEY_EPS) {
        throw new common_1.BadRequestException(`Line items total (${computed.toFixed(4)}) does not match totalPrice (${totalPrice}). Recheck quantities and unit prices.`);
    }
}
//# sourceMappingURL=order-total.util.js.map