"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var OwnerAlertNotifierService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OwnerAlertNotifierService = void 0;
const common_1 = require("@nestjs/common");
const system_config_service_1 = require("../system-config/system-config.service");
const DEFAULT_MOATMT_BASE = 'https://moatmt.sa/api';
const HTTP_TIMEOUT_MS = 8_000;
let OwnerAlertNotifierService = OwnerAlertNotifierService_1 = class OwnerAlertNotifierService {
    config;
    logger = new common_1.Logger(OwnerAlertNotifierService_1.name);
    constructor(config) {
        this.config = config;
    }
    async send(message) {
        const resolved = await this.config.resolveGuardianPhone();
        if (!resolved.phone) {
            this.logger.warn('[guardian-notify] skipped: no recipient configured (set SystemConfig.guardianPhone or SYSTEM_GUARDIAN_OWNER_PHONE)');
            return {
                delivered: false,
                via: 'skipped',
                error: 'no_recipient_configured',
                to: '',
                source: 'none',
            };
        }
        const digits = resolved.phone;
        const source = resolved.source === 'none' ? 'none' : resolved.source;
        const moatmt = await this.tryMoatmt(digits, message);
        if (moatmt.delivered)
            return { ...moatmt, source };
        const webhook = await this.tryWebhook(digits, message);
        if (webhook.delivered)
            return { ...webhook, source };
        this.logger.warn(JSON.stringify({
            event: 'guardian_alert_log_only',
            to: maskPhone(digits),
            bodyPreview: message.slice(0, 200),
            moatmtError: moatmt.error,
            webhookError: webhook.error,
            source,
        }));
        return {
            delivered: false,
            via: 'log',
            error: moatmt.error ?? webhook.error ?? 'no_provider_configured',
            to: digits,
            source,
        };
    }
    isProviderConfigured() {
        const hasMoatmt = Boolean(process.env.MOATMT_INSTANCE_ID?.trim()) &&
            Boolean(process.env.MOATMT_ACCESS_TOKEN?.trim());
        const hasWebhook = Boolean(process.env.SYSTEM_GUARDIAN_WEBHOOK_URL?.trim()) ||
            Boolean(process.env.CUSTOMER_NOTIFY_WEBHOOK_URL?.trim());
        return hasMoatmt || hasWebhook;
    }
    async ownerPhoneMasked() {
        const resolved = await this.config.resolveGuardianPhone();
        return {
            masked: resolved.phone ? maskPhone(resolved.phone) : null,
            source: resolved.source,
        };
    }
    async tryMoatmt(digits, text) {
        const accessToken = process.env.MOATMT_ACCESS_TOKEN?.trim();
        const instanceId = process.env.MOATMT_INSTANCE_ID?.trim();
        if (!accessToken || !instanceId) {
            return {
                delivered: false,
                via: 'moatmt',
                error: 'moatmt_creds_missing',
                to: digits,
            };
        }
        const base = (process.env.MOATMT_API_BASE_URL?.trim() || DEFAULT_MOATMT_BASE).replace(/\/$/, '');
        const params = new URLSearchParams({
            access_token: accessToken,
            instance_id: instanceId,
            number: digits,
        });
        const url = `${base}/send?${params.toString()}`;
        const body = {
            number: digits,
            type: 'text',
            message: text,
            instance_id: instanceId,
            access_token: accessToken,
        };
        const res = await this.postJson(url, body);
        if (res.ok) {
            return { delivered: true, via: 'moatmt', error: null, to: digits };
        }
        return {
            delivered: false,
            via: 'moatmt',
            error: `moatmt_${res.status}:${truncate(res.text, 200)}`,
            to: digits,
        };
    }
    async tryWebhook(digits, text) {
        const webhook = process.env.SYSTEM_GUARDIAN_WEBHOOK_URL?.trim() ||
            process.env.CUSTOMER_NOTIFY_WEBHOOK_URL?.trim();
        if (!webhook) {
            return {
                delivered: false,
                via: 'webhook',
                error: 'webhook_unset',
                to: digits,
            };
        }
        const res = await this.postJson(webhook, {
            to: digits,
            message: text,
            template: 'system_guardian_alert',
        });
        if (res.ok) {
            return { delivered: true, via: 'webhook', error: null, to: digits };
        }
        return {
            delivered: false,
            via: 'webhook',
            error: `webhook_${res.status}:${truncate(res.text, 200)}`,
            to: digits,
        };
    }
    async postJson(url, body) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
        try {
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            const text = await r.text().catch(() => '');
            return { ok: r.ok, status: r.status, text };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { ok: false, status: 0, text: msg };
        }
        finally {
            clearTimeout(timer);
        }
    }
};
exports.OwnerAlertNotifierService = OwnerAlertNotifierService;
exports.OwnerAlertNotifierService = OwnerAlertNotifierService = OwnerAlertNotifierService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [system_config_service_1.SystemConfigService])
], OwnerAlertNotifierService);
function maskPhone(digits) {
    if (digits.length < 6)
        return '***';
    return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}
function truncate(s, max) {
    if (s.length <= max)
        return s;
    return `${s.slice(0, max)}…`;
}
//# sourceMappingURL=owner-alert-notifier.service.js.map