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
const MOATMT_LOG_MAX_BODY = 3000;
const MOATMT_LOG_MAX_MESSAGE = 400;
function mask965ForLog(digits) {
    if (!digits || digits.length < 4) {
        return '(empty)';
    }
    if (digits.length <= 7) {
        return `${digits.slice(0, 2)}****`;
    }
    return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}
function maskIdForLog(s) {
    if (!s) {
        return '(empty)';
    }
    if (s.length <= 6) {
        return '****';
    }
    return `${s.slice(0, 2)}…${s.slice(-3)}(len${s.length})`;
}
function formatPhoneHintForLog(raw) {
    const t = (raw ?? '').replace(/\s+/g, ' ').trim();
    if (!t) {
        return '(empty)';
    }
    return `len=${t.length} last4=…${t.replace(/\D/g, '').slice(-4) || '????'}`;
}
function truncateForMoatmtLog(s, max = MOATMT_LOG_MAX_BODY) {
    const t = s.trim();
    if (t.length <= max) {
        return t;
    }
    return `${t.slice(0, max)}…(truncated ${t.length}→${max})`;
}
function normalizeMoatmtAccessToken(raw) {
    const t = (raw ?? '').trim();
    if (!t) {
        return '';
    }
    return t.replace(/^TOKEN\s*=\s*/i, '').trim();
}
function moatmtUrlWithAuthQuery(pathUrl, accessToken, instanceId, e164NoPlus) {
    const u = new URL(pathUrl);
    u.searchParams.set('access_token', accessToken);
    u.searchParams.set('instance_id', instanceId);
    u.searchParams.set('number', e164NoPlus);
    return u.toString();
}
function moatmtUrlWithNumberQuery(pathUrl, e164NoPlus) {
    const u = new URL(pathUrl);
    u.searchParams.set('number', e164NoPlus);
    return u.toString();
}
function redactMoatmtUrlForLog(u) {
    try {
        const url = new URL(u);
        if (url.searchParams.has('access_token')) {
            url.searchParams.set('access_token', '***');
        }
        if (url.searchParams.has('instance_id')) {
            const id = url.searchParams.get('instance_id') ?? '';
            url.searchParams.set('instance_id', id.length <= 6 ? '***' : `${id.slice(0, 2)}…${id.slice(-2)}(len${id.length})`);
        }
        if (url.searchParams.has('number')) {
            const n = url.searchParams.get('number') ?? '';
            url.searchParams.set('number', mask965ForLog(n));
        }
        return url.toString();
    }
    catch {
        return u;
    }
}
function redactMoatmtPayloadForLog(body) {
    const o = { ...body };
    if (o.number) {
        o.number = mask965ForLog(o.number);
    }
    if (o.access_token) {
        const x = o.access_token;
        o.access_token =
            x.length <= 8 ? '***' : `${x.slice(0, 4)}…${x.slice(-2)}(len${x.length})`;
    }
    if (o.instance_id) {
        o.instance_id = maskIdForLog(o.instance_id);
    }
    if (o.message && o.message.length > MOATMT_LOG_MAX_MESSAGE) {
        o.message = `${o.message.slice(0, MOATMT_LOG_MAX_MESSAGE)}…(len${o.message.length})`;
    }
    if (o.media_url && o.media_url.length > 120) {
        o.media_url = `${o.media_url.slice(0, 100)}…(len${o.media_url.length})`;
    }
    return JSON.stringify(o);
}
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
let CustomerNotificationsService = class CustomerNotificationsService {
    static { CustomerNotificationsService_1 = this; }
    logger = new common_1.Logger(CustomerNotificationsService_1.name);
    static moatmtCredsMissingLogged = false;
    static moatmtShortTokenWarned = false;
    onModuleInit() {
        const accessToken = normalizeMoatmtAccessToken(process.env.MOATMT_ACCESS_TOKEN);
        const instanceId = process.env.MOATMT_INSTANCE_ID?.trim() ?? '';
        const hasMoatmt = Boolean(accessToken) && Boolean(instanceId);
        const hasHook = Boolean(process.env.CUSTOMER_NOTIFY_WEBHOOK_URL?.trim());
        if (hasMoatmt) {
            const base = (process.env.MOATMT_API_BASE_URL?.trim() || 'https://moatmt.sa/api').replace(/\/$/, '');
            const media = process.env.MOATMT_USE_INVOICE_MEDIA?.trim() === 'true' ||
                process.env.MOATMT_USE_INVOICE_MEDIA?.trim() === '1';
            this.logger.log(`Customer notify: Moatmt enabled → POST ${base}/send | instance_id=${maskIdForLog(instanceId)} (len ${instanceId.length}) | access_token set (len ${accessToken.length}) | mode: ${media ? 'text+media when share URL is present' : 'text only'}; on failure: CUSTOMER_NOTIFY_WEBHOOK_URL if set.`);
            if (accessToken.length < 24) {
                this.logger.warn(`Moatmt: MOATMT_ACCESS_TOKEN is only ${accessToken.length} chars — the panel usually issues a *long* token. ` +
                    'If the API says "Access token is required", paste the full API token from moatmt.sa (not a short instance/session id).');
            }
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
        this.logger.warn(`Invoice WhatsApp not sent to customer (check MOATMT_* and CUSTOMER_NOTIFY_WEBHOOK_URL on the server). ` +
            `phone=${formatPhoneHintForLog(params.customerPhone)} orderId=${params.orderId} text_preview=${message.slice(0, 120)}…`);
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
        this.logger.warn(`Issuer WhatsApp not delivered: phone=${formatPhoneHintForLog(params.toPhone)} orderId=${params.orderId} (set MOATMT_* or STAFF_INVOICE_NOTIFY_WEBHOOK_URL / CUSTOMER_NOTIFY_WEBHOOK_URL). preview=${message.slice(0, 100)}…`);
    }
    buildMoatmtInvoiceMediaPayload(params) {
        const on = process.env.MOATMT_USE_INVOICE_MEDIA?.trim() === 'true' ||
            process.env.MOATMT_USE_INVOICE_MEDIA?.trim() === '1';
        if (!on) {
            return null;
        }
        const mediaUrl = params.invoicePdfUrl?.trim() ||
            params.invoiceShareUrl?.trim() ||
            params.invoiceShareItems?.[0]?.url?.trim() ||
            null;
        if (!mediaUrl) {
            return null;
        }
        const shortId = params.orderId.replace(/-/g, '').slice(0, 8);
        const isPdf = Boolean(params.invoicePdfUrl?.trim());
        const filename = process.env.MOATMT_INVOICE_MEDIA_FILENAME?.trim() ||
            (isPdf || /\.pdf($|[?#])/i.test(mediaUrl) ?
                `invoice_${shortId}.pdf`
                : `invoice_${shortId}.png`);
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
        const mediaUrl = params.invoicePdfUrl?.trim() || params.invoiceShareUrl?.trim() || '';
        if (!on || !mediaUrl) {
            return null;
        }
        const shortId = params.orderId.replace(/-/g, '').slice(0, 8);
        const isPdf = Boolean(params.invoicePdfUrl?.trim());
        const filename = process.env.MOATMT_INVOICE_MEDIA_FILENAME?.trim() ||
            (isPdf || /\.pdf($|[?#])/i.test(mediaUrl) ?
                `invoice_${shortId}.pdf`
                : `invoice_${shortId}.png`);
        const caption = process.env.MOATMT_EDIT_MEDIA_CAPTION?.trim() ||
            process.env.MOATMT_MEDIA_CAPTION?.trim() ||
            'فاتورتك مرفقة 👇';
        return {
            mediaUrl,
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
        const accessToken = normalizeMoatmtAccessToken(process.env.MOATMT_ACCESS_TOKEN);
        const instanceId = process.env.MOATMT_INSTANCE_ID?.trim();
        if (!accessToken || !instanceId) {
            if (!CustomerNotificationsService_1.moatmtCredsMissingLogged) {
                CustomerNotificationsService_1.moatmtCredsMissingLogged = true;
                this.logger.warn('Moatmt: MOATMT_INSTANCE_ID and/or MOATMT_ACCESS_TOKEN is empty — no WhatsApp API calls (set both in host env, redeploy).');
            }
            return false;
        }
        if (accessToken.length < 24 &&
            !CustomerNotificationsService_1.moatmtShortTokenWarned) {
            CustomerNotificationsService_1.moatmtShortTokenWarned = true;
            this.logger.warn(`Moatmt: access token length is ${accessToken.length} (expected a long value from the Moatmt dashboard). API may return "Access token is required".`);
        }
        const digits = (0, kuwait_customer_phone_1.parseKuwaitMobile965)(rawPhone);
        if (!digits) {
            this.logger.warn(`Moatmt send skipped: invalid Kuwait mobile. raw=${formatPhoneHintForLog(rawPhone)}. ` +
                'Expected: 8 digits (5/6/9…), or +965/965/00965 + 8 digits. Example: 51234567 or 96551234567.');
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
            if (await this.moatmpPostOne(url, mediaBody, 'media')) {
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
        return this.moatmpPostOne(url, textBody, 'text');
    }
    async moatmpPostOne(url, body, kind) {
        const to965 = body.number;
        const omitQuery = process.env.MOATMT_OMIT_QUERY_AUTH?.trim() === '1' ||
            process.env.MOATMT_OMIT_QUERY_AUTH?.trim() === 'true';
        const finalUrl = omitQuery
            ? moatmtUrlWithNumberQuery(url, body.number)
            : moatmtUrlWithAuthQuery(url, body.access_token, body.instance_id, body.number);
        this.logger.log(`[Moatmt] request → ${kind} | url=${redactMoatmtUrlForLog(finalUrl)} | to=${mask965ForLog(String(to965))} | ` +
            `body=${redactMoatmtPayloadForLog(body)}`);
        const attempts = [
            {
                label: 'json (query+body, Content-Type only)',
                run: () => this.moatmpFetch(finalUrl, body, { encoding: 'json-moatmt' }),
            },
            {
                label: 'json (query+body) + Authorization: Bearer',
                run: () => this.moatmpFetch(finalUrl, body, { encoding: 'json' }),
            },
        ];
        if (process.env.MOATMT_FORCE_FORM?.trim() === '1') {
            attempts.length = 0;
            attempts.push({
                label: 'form (MOATMT_FORCE_FORM=1)',
                run: () => this.moatmpFetch(finalUrl, body, { encoding: 'form' }),
            });
        }
        else {
            attempts.push({
                label: 'form-urlencoded (query+body)',
                run: () => this.moatmpFetch(finalUrl, body, { encoding: 'form' }),
            }, {
                label: 'form-urlencoded+Bearer',
                run: () => this.moatmpFetch(finalUrl, body, { encoding: 'form-bearer' }),
            }, {
                label: 'json body + number in query only (no token in URL)',
                run: () => this.moatmpFetch(moatmtUrlWithNumberQuery(url, body.number), body, { encoding: 'json-moatmt' }),
            });
        }
        for (let i = 0; i < attempts.length; i++) {
            const step = attempts[i];
            const r = await step.run();
            this.logger.log(`[Moatmt] try "${step.label}" → http ${r.status} | to=${mask965ForLog(String(to965))} | raw=${truncateForMoatmtLog(r.text, 2000)}`);
            if (r.exn) {
                this.logger.warn(`[Moatmt] [${step.label}] ${r.exn}`);
                continue;
            }
            if (!r.ok) {
                this.logger.warn(`[Moatmt] HTTP [${step.label}]: status=${r.status} body_start=${r.text.slice(0, 500)}`);
                if (r.status >= 500) {
                    return false;
                }
                continue;
            }
            if (this.moatmpResponseLooksLikeError(r.text)) {
                if (this.moatmpLooksLikeMissingTokenError(r.text) &&
                    i < attempts.length - 1) {
                    this.logger.warn(`[Moatmt] auth/body not accepted on [${step.label}] — trying next encoding…`);
                    continue;
                }
                this.logger.warn(`[Moatmt] error in body [${step.label}]: ${r.text.slice(0, 800)}`);
                return false;
            }
            this.logger.log(`[Moatmt] send ok [${step.label}] to=${mask965ForLog(String(to965))}`);
            return true;
        }
        return false;
    }
    moatmpLooksLikeMissingTokenError(responseText) {
        return /access token is required|token is required|invalid\s+access/i.test(responseText);
    }
    async moatmpFetch(url, body, opts) {
        const accessToken = body.access_token ?? '';
        let headers = {};
        let reqBody;
        if (opts.encoding === 'json-moatmt') {
            headers = { 'Content-Type': 'application/json' };
            reqBody = JSON.stringify(body);
        }
        else if (opts.encoding === 'json') {
            headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
            };
            reqBody = JSON.stringify(body);
        }
        else if (opts.encoding === 'form') {
            headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
            const p = new URLSearchParams();
            for (const [k, v] of Object.entries(body)) {
                p.set(k, v);
            }
            reqBody = p.toString();
        }
        else {
            headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Bearer ${accessToken}`,
            };
            const p = new URLSearchParams();
            for (const [k, v] of Object.entries(body)) {
                p.set(k, v);
            }
            reqBody = p.toString();
        }
        try {
            const res = await fetch(url, { method: 'POST', headers, body: reqBody });
            const text = await res.text();
            return { ok: res.ok, status: res.status, text };
        }
        catch (e) {
            return {
                ok: false,
                status: 0,
                text: '',
                exn: String(e),
            };
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