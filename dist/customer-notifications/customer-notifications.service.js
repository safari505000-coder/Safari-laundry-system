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
const branding_1 = require("../common/constants/branding");
function buildInvoiceIssuedMessage(params) {
    const lines = [];
    lines.push('حياك الله! 🌿');
    lines.push('');
    lines.push(`نسعد بخدمتكم في ${branding_1.BRAND_CUSTOMER_AR}.`);
    lines.push('');
    lines.push(`🏷️ رقم الفاتورة: ${params.invoiceLabel}`);
    lines.push(`💰 *الإجمالي: ${params.amountKd} د.ك*`);
    lines.push('');
    lines.push('ملابسكم في أيدٍ أمينة، وسنعتني بها بأفضل صورة — شكراً لثقتكم بنا.');
    if (params.paymentUrl) {
        lines.push('');
        lines.push('🔒 للدفع السريع عبر الرابط الآمن:');
        lines.push(params.paymentUrl);
    }
    if (params.invoiceShareItems && params.invoiceShareItems.length > 0) {
        lines.push('');
        lines.push('📄 نسخة الفاتورة (عرض / حفظ PDF):');
        for (const it of params.invoiceShareItems) {
            lines.push(`• ${it.label}: ${it.url}`);
        }
    }
    else if (params.invoiceShareUrl) {
        lines.push('');
        lines.push('📄 نسخة الفاتورة — افتح الرابط لعرضها أو حفظها PDF:');
        lines.push(params.invoiceShareUrl);
    }
    else if (params.detailsLink) {
        lines.push('');
        lines.push('🔗 لمراجعة تفاصيل الطلب:');
        lines.push(params.detailsLink);
    }
    lines.push('');
    lines.push(`فريق ${branding_1.BRAND_SYSTEM_AR} 🇰🇼`);
    return lines.join('\n');
}
function buildInvoiceEditedIssuerMessage(params) {
    const lines = [];
    lines.push('تنبيه — تعديل فاتورة');
    lines.push('');
    lines.push(`فاتورتك *${params.invoiceLabel}* تم تعديلها من الكول سنتر (${params.editorLabel}).`);
    lines.push(`الإجمالي بعد التعديل: *${params.newAmountKd} د.ك*`);
    if (params.invoiceShareUrl) {
        lines.push('');
        lines.push('📄 نسخة محدثة — طباعة/عرض:');
        lines.push(params.invoiceShareUrl);
    }
    else {
        lines.push('');
        lines.push('افتح تطبيق السفاري — الفواتير — لإعادة الطباعة بأرقام محدثة.');
    }
    lines.push('');
    lines.push(`فريق ${branding_1.BRAND_SYSTEM_AR} 🇰🇼`);
    return lines.join('\n');
}
function kuwaitPhoneDigitsForWhatsApp(phone) {
    const d = phone.replace(/[\s\-+]/g, '');
    if (d.length === 8 && /^[569]\d{7}$/.test(d)) {
        return `965${d}`;
    }
    if (d.length === 11 && d.startsWith('965') && /^965[569]\d{7}$/.test(d)) {
        return d;
    }
    if (d.length === 12 && d.startsWith('00965') && /^00965[569]\d{7}$/.test(d)) {
        return d.slice(2);
    }
    if (d.length > 0 && d.startsWith('965') && d.length >= 11) {
        return d;
    }
    return null;
}
let CustomerNotificationsService = CustomerNotificationsService_1 = class CustomerNotificationsService {
    logger = new common_1.Logger(CustomerNotificationsService_1.name);
    onModuleInit() {
        const hasMoatmt = Boolean(process.env.MOATMT_ACCESS_TOKEN?.trim()) &&
            Boolean(process.env.MOATMT_INSTANCE_ID?.trim());
        const hasHook = Boolean(process.env.CUSTOMER_NOTIFY_WEBHOOK_URL?.trim());
        if (hasMoatmt) {
            this.logger.log('Customer notify: Moatmt /send enabled (and webhook fallback if Moatmt fails and CUSTOMER_NOTIFY_WEBHOOK_URL is set).');
        }
        else if (hasHook) {
            this.logger.log('Customer notify: CUSTOMER_NOTIFY_WEBHOOK_URL is set.');
        }
        else {
            this.logger.warn('Customer notify: no MOATMT_INSTANCE_ID+MOATMT_ACCESS_TOKEN and no CUSTOMER_NOTIFY_WEBHOOK_URL — invoice WhatsApp only logs, nothing is sent.');
        }
    }
    notifyInvoiceIssued(params) {
        setImmediate(() => {
            void this.deliver(params).catch((e) => this.logger.warn(`Invoice notify failed: ${e}`));
        });
    }
    notifyInvoiceEditedForIssuer(params) {
        setImmediate(() => {
            void this.deliverIssuerEdit(params).catch((e) => this.logger.warn(`Invoice issuer notify failed: ${e}`));
        });
    }
    async deliver(params) {
        const base = (process.env.PUBLIC_WEB_APP_URL ?? '').replace(/\/$/, '') || '';
        const hasPublicShare = Boolean(params.invoiceShareUrl) ||
            (params.invoiceShareItems && params.invoiceShareItems.length > 0);
        const detailsLink = hasPublicShare || !base ?
            undefined
            : `${base}/orders?highlight=${encodeURIComponent(params.orderId)}`;
        const message = buildInvoiceIssuedMessage({
            invoiceLabel: params.invoiceLabel,
            amountKd: params.amountKd,
            paymentUrl: params.paymentUrl,
            invoiceShareUrl: params.invoiceShareUrl,
            invoiceShareItems: params.invoiceShareItems,
            detailsLink,
        });
        if (await this.trySendMoatmt(params.customerPhone, message)) {
            return;
        }
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
                    invoiceShareUrl: params.invoiceShareUrl ?? null,
                    invoiceShareItems: params.invoiceShareItems ?? null,
                }),
            });
            if (!res.ok) {
                this.logger.warn(`CUSTOMER_NOTIFY_WEBHOOK_URL returned ${res.status}`);
            }
            return;
        }
        this.logger.log(`[notify] ${params.customerPhone}: ${message.slice(0, 120)}… (set MOATMT_* or CUSTOMER_NOTIFY_WEBHOOK_URL to send)`);
    }
    async deliverIssuerEdit(params) {
        const message = buildInvoiceEditedIssuerMessage({
            invoiceLabel: params.invoiceLabel,
            newAmountKd: params.newAmountKd,
            editorLabel: params.editorLabel,
            invoiceShareUrl: params.invoiceShareUrl,
        });
        if (await this.trySendMoatmt(params.toPhone, message)) {
            return;
        }
        const staffWebhook = process.env.STAFF_INVOICE_NOTIFY_WEBHOOK_URL?.trim();
        const customerWebhook = process.env.CUSTOMER_NOTIFY_WEBHOOK_URL?.trim();
        const webhook = staffWebhook || customerWebhook;
        if (webhook) {
            const res = await fetch(webhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: params.toPhone,
                    message,
                    orderId: params.orderId,
                    template: 'invoice_edited_issuer',
                    invoiceShareUrl: params.invoiceShareUrl ?? null,
                }),
            });
            if (!res.ok) {
                this.logger.warn(`${staffWebhook ? 'STAFF_INVOICE_NOTIFY_WEBHOOK_URL' : 'CUSTOMER_NOTIFY_WEBHOOK_URL'} returned ${res.status}`);
            }
            return;
        }
        this.logger.log(`[notify issuer] ${params.toPhone}: ${message.slice(0, 120)}… (set MOATMT_* or STAFF/ CUSTOMER webhooks)`);
    }
    async trySendMoatmt(rawPhone, message) {
        const accessToken = process.env.MOATMT_ACCESS_TOKEN?.trim();
        const instanceId = process.env.MOATMT_INSTANCE_ID?.trim();
        if (!accessToken || !instanceId) {
            return false;
        }
        const number = kuwaitPhoneDigitsForWhatsApp(rawPhone);
        if (!number) {
            this.logger.warn(`Moatmt send skipped: could not parse Kuwait mobile from value ending …${rawPhone.slice(-4)}`);
            return false;
        }
        const base = (process.env.MOATMT_API_BASE_URL?.trim() || 'https://moatmt.sa/api').replace(/\/$/, '');
        const url = `${base}/send`;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    number,
                    type: 'text',
                    message,
                    instance_id: instanceId,
                    access_token: accessToken,
                }),
            });
            if (!res.ok) {
                const errText = await res.text();
                this.logger.warn(`Moatmt POST /send ${res.status}: ${errText.slice(0, 200)}`);
                return false;
            }
            this.logger.log(`Moatmt WhatsApp sent to …${rawPhone.slice(-4)}`);
            return true;
        }
        catch (e) {
            this.logger.warn(`Moatmt request failed: ${e}`);
            return false;
        }
    }
};
exports.CustomerNotificationsService = CustomerNotificationsService;
exports.CustomerNotificationsService = CustomerNotificationsService = CustomerNotificationsService_1 = __decorate([
    (0, common_1.Injectable)()
], CustomerNotificationsService);
//# sourceMappingURL=customer-notifications.service.js.map