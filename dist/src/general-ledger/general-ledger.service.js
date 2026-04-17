"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeneralLedgerService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
let GeneralLedgerService = class GeneralLedgerService {
    append(tx, row) {
        const dec = typeof row.amount === 'object' &&
            row.amount !== null &&
            'toFixed' in row.amount
            ? row.amount
            : new client_1.Prisma.Decimal(String(row.amount));
        return tx.generalLedgerEntry.create({
            data: {
                entryType: row.entryType,
                amount: dec,
                memo: row.memo ?? null,
                ...(row.metadata !== undefined ? { metadata: row.metadata } : {}),
                customerId: row.customerId ?? null,
                orderId: row.orderId ?? null,
                expenseId: row.expenseId ?? null,
                actorUserId: row.actorUserId ?? null,
            },
        });
    }
};
exports.GeneralLedgerService = GeneralLedgerService;
exports.GeneralLedgerService = GeneralLedgerService = __decorate([
    (0, common_1.Injectable)()
], GeneralLedgerService);
//# sourceMappingURL=general-ledger.service.js.map