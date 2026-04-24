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
        lines.push('📱 رابط الدفع + نسخة الفاتورة تُرسل لجوالكم (واتساب) — للدفع من هنا:');
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
        const hasMoatmt = Boolean(process.env.MOATMT_ACCESS_TOKEN?.trim()) &&
            Boolean(process.env.MOATMT_INSTANCE_ID?.trim());
        const hasHook = Boolean(process.env.CUSTOMER_NOTIFY_WEBHOOK_URL?.trim());
        if (hasMoatmt) {
            const media = process.env.MOATMT_USE_INVOICE_MEDIA?.trim() === 'true' ||
                process.env.MOATMT_USE_INVOICE_MEDIA?.trim() === '1';
            this.logger.log(`Customer notify: Moatmt /send enabled (mode: ${media ? 'text+media when share URL is present' : 'text'}; webhook on failure if CUSTOMER_NOTIFY_WEBHOOK_URL is set).`);
        }
        else if (hasHook) {
            this.logger.log('Customer notify: CUSTOMER_NOTIFY_WEBHOOK_URL is set.');
        }
        else {
            this.logger.warn('Customer notify: no MOATMT_INSTANCE_ID+MOATMT_ACCESS_TOKEN and no CUSTOMER_NOTIFY_WEBHOOK_URL — invoice text only hits logs.');
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
        if (await this.trySendMoatmt(params.customerPhone, message, this.buildMoatmtInvoiceMediaPayload(params))) {
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
        this.logger.log(`[notify] ${params.customerPhone}: ${message.slice(0, 120)}… (set MOATMT_* or CUSTOMER_NOTIFY_WEBHOOK_URL)`);
    }
    async deliverIssuerEdit(params) {
        const message = buildInvoiceEditedIssuerMessage({
            invoiceLabel: params.invoiceLabel,
            newAmountKd: params.newAmountKd,
            editorLabel: params.editorLabel,
            invoiceShareUrl: params.invoiceShareUrl,
        });
        if (await this.trySendMoatmt(params.toPhone, message, this.buildMoatmtIssuerEditMediaPayload(params))) {
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
        this.logger.log(`[notify issuer] ${params.toPhone}: ${message.slice(0, 120)}… (set MOATMT_* or STAFF_/CUSTOMER_ webhook)`);
    }
    buildMoatmtInvoiceMediaPayload(params) {
        const on = process.env.MOATMT_USE_INVOICE_MEDIA?.trim() === 'true' ||
            process.env.MOATMT_USE_INVOICE_MEDIA?.trim() === '1';
        if (!on) {
            return null;
        }
        const mediaUrl = params.invoiceShareUrl?.trim() ||
            params.invoiceShareItems?.[0]?.url?.trim() ||
            null;
        if (!mediaUrl) {
            return null;
        }
        const shortId = params.orderId.replace(/-/g, '').slice(0, 8);
        const filename = process.env.MOATMT_INVOICE_MEDIA_FILENAME?.trim() ||
            `invoice_${shortId}.png`;
        return {
            mediaUrl,
            filename,
            caption: this.buildMoatmtMediaCaptionForInvoice({
                paymentUrl: params.paymentUrl,
            }),
        };
    }
    buildMoatmtIssuerEditMediaPayload(params) {
        const on = process.env.MOATMT_USE_INVOICE_MEDIA?.trim() === 'true' ||
            process.env.MOATMT_USE_INVOICE_MEDIA?.trim() === '1';
        if (!on || !params.invoiceShareUrl?.trim()) {
            return null;
        }
        const shortId = params.orderId.replace(/-/g, '').slice(0, 8);
        const filename = process.env.MOATMT_INVOICE_MEDIA_FILENAME?.trim() ||
            `invoice_${shortId}.png`;
        const caption = process.env.MOATMT_EDIT_MEDIA_CAPTION?.trim() ||
            process.env.MOATMT_MEDIA_CAPTION?.trim() ||
            'فاتورتك مرفقة 👇';
        return {
            mediaUrl: params.invoiceShareUrl,
            filename,
            caption,
        };
    }
    buildMoatmtMediaCaptionForInvoice(params) {
        let c = process.env.MOATMT_MEDIA_CAPTION?.trim() || 'فاتورتك مرفقة 👇';
        if (params.paymentUrl) {
            c += `\n\n🔒 ${params.paymentUrl}`;
        }
        return c;
    }
    async trySendMoatmt(rawPhone, textMessage, media) {
        const accessToken = process.env.MOATMT_ACCESS_TOKEN?.trim();
        const instanceId = process.env.MOATMT_INSTANCE_ID?.trim();
        if (!accessToken || !instanceId) {
            return false;
        }
        const digits = (0, kuwait_customer_phone_1.parseKuwaitMobile965)(rawPhone);
        if (!digits) {
            this.logger.warn(`Moatmt send skipped: invalid Kuwait mobile (…${rawPhone.slice(-4)})`);
            return false;
        }
        const base = (process.env.MOATMT_API_BASE_URL?.trim() || 'https://moatmt.sa/api').replace(/\/$/, '');
        const url = `${base}/send`;
        if (media) {
            const mediaBody = {
                number: digits,
                type: 'media',
                message: media.caption,
                media_url: media.mediaUrl,
                filename: media.filename,
                instance_id: instanceId,
                access_token: accessToken,
            };
            if (await this.moatmpPostOne(url, mediaBody, rawPhone, 'media')) {
                return true;
            }
            this.logger.warn('Moatmt: media send failed; falling back to type=text (full invoice message).');
        }
        const textBody = {
            number: digits,
            type: 'text',
            message: textMessage,
            instance_id: instanceId,
            access_token: accessToken,
        };
        return this.moatmpPostOne(url, textBody, rawPhone, 'text');
    }
    async moatmpPostOne(url, body, rawPhone, kind) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const responseText = await res.text();
            if (!res.ok) {
                this.logger.warn(`Moatmt POST /send ${res.status} [${kind}]: ${responseText.slice(0, 500)}`);
                return false;
            }
            if (this.moatmpResponseLooksLikeError(responseText)) {
                this.logger.warn(`Moatmt error in body [${kind}]: ${responseText.slice(0, 500)}`);
                return false;
            }
            this.logger.log(`Moatmt OK [${kind}] to …${rawPhone.slice(-4)}`);
            return true;
        }
        catch (e) {
            this.logger.warn(`Moatmt request failed [${kind}]: ${e}`);
            return false;
        }
    }
    moatmpResponseLooksLikeError(responseText) {
        const t = responseText.trim();
        if (!t) {
            return false;
        }
        try {
            const j = JSON.parse(t);
            if (j.error != null) {
                return true;
            }
            if (j.success === false) {
                return true;
            }
            if (typeof j.status === 'string' && /fail|error/i.test(j.status)) {
                return true;
            }
        }
        catch {
        }
        const lower = t.toLowerCase();
        return /"error"\s*:|success\s*:\s*false|فشل|invalid/i.test(lower);
    }
};
exports.CustomerNotificationsService = CustomerNotificationsService;
exports.CustomerNotificationsService = CustomerNotificationsService = CustomerNotificationsService_1 = __decorate([
    (0, common_1.Injectable)()
], CustomerNotificationsService);
//# sourceMappingURL=customer-notifications.service.js.map