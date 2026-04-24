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
const kuwait_customer_phone_1 = require("../common/validation/kuwait-customer-phone");
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
        lines.push('📱 رابط الدفع + نسخة الفاتورة تُرسل لجوالكم (SMS) — للدفع من هنا:');
        lines.push('🔒 رابط UPayments:');
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
let CustomerNotificationsService = CustomerNotificationsService_1 = class CustomerNotificationsService {
    logger = new common_1.Logger(CustomerNotificationsService_1.name);
    onModuleInit() {
        const k = process.env.INFOBIP_API_KEY?.trim();
        const b = process.env.INFOBIP_BASE_URL?.trim();
        const f = process.env.INFOBIP_SMS_FROM?.trim();
        const infobipOk = Boolean(k && b && f);
        const infobipPartial = Boolean((k || b || f) && !infobipOk);
        if (infobipOk) {
            this.logger.log('Customer notify: Infobip SMS is configured.');
        }
        else if (infobipPartial) {
            this.logger.warn('Customer notify: Infobip incomplete — set INFOBIP_BASE_URL, INFOBIP_API_KEY, and INFOBIP_SMS_FROM together to send SMS.');
        }
        const hasHook = Boolean(process.env.CUSTOMER_NOTIFY_WEBHOOK_URL?.trim());
        if (hasHook) {
            this.logger.log('Customer notify: CUSTOMER_NOTIFY_WEBHOOK_URL is set.');
        }
        if (!infobipOk && !hasHook) {
            this.logger.warn('Customer notify: no Infobip SMS and no CUSTOMER_NOTIFY_WEBHOOK_URL — invoice text only hits logs.');
        }
    }
    notifyInvoiceIssued(params) {
        setImmediate(() => {
            void this.deliver(params).catch((e) => this.logger.warn(`Invoice notify failed: ${e}`));
        });
    }
    async deliverInvoiceIssuedNow(params) {
        await this.deliver(params);
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
        if (this.isInfobipConfigured()) {
            await this.trySendInfobipSms(params.customerPhone, message);
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
        if (!this.isInfobipConfigured()) {
            this.logger.log(`[notify] ${params.customerPhone}: ${message.slice(0, 120)}… (set Infobip or CUSTOMER_NOTIFY_WEBHOOK_URL to send)`);
        }
    }
    async deliverIssuerEdit(params) {
        const message = buildInvoiceEditedIssuerMessage({
            invoiceLabel: params.invoiceLabel,
            newAmountKd: params.newAmountKd,
            editorLabel: params.editorLabel,
            invoiceShareUrl: params.invoiceShareUrl,
        });
        if (this.isInfobipConfigured()) {
            await this.trySendInfobipSms(params.toPhone, message);
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
        if (!this.isInfobipConfigured()) {
            this.logger.log(`[notify issuer] ${params.toPhone}: ${message.slice(0, 120)}… (set Infobip or STAFF_/CUSTOMER_ webhook)`);
        }
    }
    isInfobipConfigured() {
        return (Boolean(process.env.INFOBIP_API_KEY?.trim()) &&
            Boolean(process.env.INFOBIP_BASE_URL?.trim()) &&
            Boolean(process.env.INFOBIP_SMS_FROM?.trim()));
    }
    async trySendInfobipSms(rawPhone, text) {
        const apiKey = process.env.INFOBIP_API_KEY?.trim();
        const base = process.env.INFOBIP_BASE_URL?.trim();
        const from = process.env.INFOBIP_SMS_FROM?.trim();
        if (!apiKey || !base || !from) {
            return false;
        }
        const to = (0, kuwait_customer_phone_1.parseKuwaitMobile965)(rawPhone);
        if (!to) {
            this.logger.warn(`Infobip SMS skipped: invalid Kuwait mobile (…${rawPhone.slice(-4)})`);
            return false;
        }
        const url = `${base.replace(/\/$/, '')}/sms/2/text/advanced`;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `App ${apiKey}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    messages: [
                        {
                            from,
                            destinations: [{ to }],
                            text,
                        },
                    ],
                }),
            });
            if (!res.ok) {
                const errText = await res.text();
                this.logger.warn(`Infobip SMS ${res.status}: ${errText.slice(0, 400)}`);
                return false;
            }
            this.logger.log(`Infobip SMS queued for …${rawPhone.slice(-4)}`);
            return true;
        }
        catch (e) {
            this.logger.warn(`Infobip SMS request failed: ${e}`);
            return false;
        }
    }
};
exports.CustomerNotificationsService = CustomerNotificationsService;
exports.CustomerNotificationsService = CustomerNotificationsService = CustomerNotificationsService_1 = __decorate([
    (0, common_1.Injectable)()
], CustomerNotificationsService);
//# sourceMappingURL=customer-notifications.service.js.map