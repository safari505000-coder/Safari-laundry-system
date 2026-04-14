"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertOrderStatusTransition = assertOrderStatusTransition;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const terminal = [client_1.OrderStatus.COMPLETED, client_1.OrderStatus.CANCELED];
const forwardEdges = {
    [client_1.OrderStatus.PENDING]: [client_1.OrderStatus.PICKED_UP, client_1.OrderStatus.CANCELED],
    [client_1.OrderStatus.PICKED_UP]: [client_1.OrderStatus.IN_PROGRESS, client_1.OrderStatus.CANCELED],
    [client_1.OrderStatus.IN_PROGRESS]: [
        client_1.OrderStatus.OUT_FOR_DELIVERY,
        client_1.OrderStatus.CANCELED,
    ],
    [client_1.OrderStatus.OUT_FOR_DELIVERY]: [client_1.OrderStatus.COMPLETED, client_1.OrderStatus.CANCELED],
    [client_1.OrderStatus.COMPLETED]: [],
    [client_1.OrderStatus.CANCELED]: [],
};
function assertOrderStatusTransition(current, next, hasDriver) {
    if (current === next) {
        return;
    }
    if (terminal.includes(current)) {
        throw new common_1.BadRequestException(`Order status cannot change once it is ${current}`);
    }
    if (next === client_1.OrderStatus.PICKED_UP && !hasDriver) {
        throw new common_1.BadRequestException('Status PICKED_UP requires an assigned driver before this transition');
    }
    if (next === client_1.OrderStatus.COMPLETED &&
        current !== client_1.OrderStatus.OUT_FOR_DELIVERY) {
        throw new common_1.BadRequestException('Status COMPLETED is only allowed after OUT_FOR_DELIVERY');
    }
    const allowed = forwardEdges[current] ?? [];
    if (!allowed.includes(next)) {
        throw new common_1.BadRequestException(`Invalid status transition: ${current} → ${next}. Allowed from ${current}: ${allowed.join(', ') || 'none'}`);
    }
}
//# sourceMappingURL=order-status.machine.js.map