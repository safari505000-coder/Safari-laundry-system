"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var CustomerNotificationsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerNotificationsService = void 0;
const common_1 = require("@nestjs/common");
let CustomerNotificationsService = CustomerNotificationsService_1 = class CustomerNotificationsService {
    logger = new common_1.Logger(CustomerNotificationsService_1.name);
    notifyInvoiceIssued(params) {
        setImmediate(() => {
            void this.deliver(params).catch((e) => this.logger.warn(`Invoice notify failed: ${e}`));
        });
    }
    async deliver(params) {
        const base = (process.env.PUBLIC_WEB_APP_URL ?? '').replace(/\/$/, '') || '';
        const detailsLink = base ?
            `${base}/orders?highlight=${encodeURIComponent(params.orderId)}`
            : `Order ${params.orderId}`;
        const linkPart = params.paymentUrl ?
            ` Pay here: ${params.paymentUrl}`
            : ` View: ${detailsLink}`;
        const message = `Welcome to Safari Express Laundry. Invoice ${params.invoiceLabel} for KD ${params.amountKd} has been issued.${linkPart}`;
        const webhook = process.env.CUSTOMER_NOTIFY_WEBHOOK_URL?.trim();
        if (webhook) {
            const res = await fetch(webhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: params.customerPhone,
                    message,
                    orderId: params.orderId,
                    template: 'invoice_issued',
                }),
            });
            if (!res.ok) {
                this.logger.warn(`CUSTOMER_NOTIFY_WEBHOOK_URL returned ${res.status}`);
            }
            return;
        }
        this.logger.log(`[notify] ${params.customerPhone}: ${message.slice(0, 120)}… (set CUSTOMER_NOTIFY_WEBHOOK_URL to send)`);
    }
};
exports.CustomerNotificationsService = CustomerNotificationsService;
exports.CustomerNotificationsService = CustomerNotificationsService = CustomerNotificationsService_1 = __decorate([
    (0, common_1.Injectable)()
], CustomerNotificationsService);
//# sourceMappingURL=customer-notifications.service.js.map