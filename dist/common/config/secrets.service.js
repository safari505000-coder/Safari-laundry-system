"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var SecretsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecretsService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
let SecretsService = SecretsService_1 = class SecretsService {
    logger = new common_1.Logger(SecretsService_1.name);
    cache = new Map();
    awsClient = null;
    ttlMs() {
        const n = Number.parseInt(process.env.SECRETS_CACHE_TTL_MS ?? '300000', 10);
        return Number.isFinite(n) && n > 0 ? n : 300_000;
    }
    async get(key) {
        if (process.env.NODE_ENV !== 'production') {
            return process.env[key];
        }
        const provider = (process.env.SECRETS_PROVIDER ?? '').toLowerCase();
        if (!provider) {
            this.logger.warn('SECRETS_PROVIDER unset in production — using env fallback (not recommended)');
            return process.env[key];
        }
        const now = Date.now();
        const hit = this.cache.get(key);
        if (hit && hit.exp > now) {
            return hit.value;
        }
        let value;
        if (provider === 'aws') {
            value = await this.loadAws(key);
        }
        else if (provider === 'vault') {
            value = await this.loadVault(key);
        }
        else {
            value = process.env[key];
        }
        if (value !== undefined) {
            this.cache.set(key, { value, exp: now + this.ttlMs() });
        }
        return value;
    }
    invalidate(key) {
        this.cache.delete(key);
    }
    async loadAws(secretId) {
        try {
            const mod = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-secrets-manager')));
            if (!this.awsClient) {
                this.awsClient = new mod.SecretsManagerClient({
                    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
                });
            }
            const out = await this.awsClient.send(new mod.GetSecretValueCommand({ SecretId: secretId }));
            if (out.SecretString) {
                return out.SecretString;
            }
            return undefined;
        }
        catch (e) {
            this.logger.error(`aws_secrets_failed id=${secretId} ${e instanceof Error ? e.message : e}`);
            return undefined;
        }
    }
    async loadVault(secretLogicalKey) {
        const addr = process.env.VAULT_ADDR?.replace(/\/$/, '');
        const token = process.env.VAULT_TOKEN;
        const mountPath = (process.env.VAULT_KV_MOUNT ?? 'secret/data').replace(/^\/+|\/+$/g, '');
        if (!addr || !token) {
            return undefined;
        }
        const path = `${mountPath}/${secretLogicalKey}`.replace(/\/+/g, '/');
        const url = `${addr}/v1/${path}`;
        const cfg = {
            method: 'GET',
            url,
            headers: { 'X-Vault-Token': token },
            timeout: 5_000,
            validateStatus: () => true,
        };
        try {
            const res = await axios_1.default.request(cfg);
            if (res.status >= 200 && res.status < 300 && res.data?.data?.data) {
                const d = res.data.data.data;
                const field = process.env.VAULT_SECRET_FIELD ?? 'value';
                const raw = d[field] ?? d[Object.keys(d)[0] ?? ''];
                return raw === undefined || raw === null ? undefined : String(raw);
            }
            return undefined;
        }
        catch (e) {
            this.logger.error(`vault_secrets_failed ${e instanceof Error ? e.message : e}`);
            return undefined;
        }
    }
};
exports.SecretsService = SecretsService;
exports.SecretsService = SecretsService = SecretsService_1 = __decorate([
    (0, common_1.Injectable)()
], SecretsService);
//# sourceMappingURL=secrets.service.js.map