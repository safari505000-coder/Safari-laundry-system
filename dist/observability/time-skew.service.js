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
var TimeSkewService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeSkewService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const discord_alert_service_1 = require("../common/services/discord-alert.service");
const DRIFT_WARN_MS = Number.parseInt(process.env.TIME_SKEW_WARN_MS ?? '2000', 10) || 2_000;
let TimeSkewService = TimeSkewService_1 = class TimeSkewService {
    discord;
    logger = new common_1.Logger(TimeSkewService_1.name);
    constructor(discord) {
        this.discord = discord;
    }
    async check() {
        try {
            const ac = new AbortController();
            const t = setTimeout(() => ac.abort(), 5_000);
            const r = await fetch('https://worldtimeapi.org/api/timezone/UTC', {
                signal: ac.signal,
            });
            clearTimeout(t);
            if (!r.ok) {
                return;
            }
            const j = (await r.json());
            if (typeof j.unixtime !== 'number') {
                return;
            }
            const remoteMs = j.unixtime * 1000;
            const drift = Math.abs(Date.now() - remoteMs);
            if (drift > DRIFT_WARN_MS) {
                this.logger.warn(JSON.stringify({
                    event: 'ops_time_skew',
                    traceId: undefined,
                    orderId: undefined,
                    driftMs: drift,
                }));
                this.discord.enqueue('ops_time_skew', { driftMs: drift, timestamp: Date.now() });
            }
        }
        catch {
        }
    }
};
exports.TimeSkewService = TimeSkewService;
__decorate([
    (0, schedule_1.Interval)(120_000),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TimeSkewService.prototype, "check", null);
exports.TimeSkewService = TimeSkewService = TimeSkewService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [discord_alert_service_1.DiscordAlertService])
], TimeSkewService);
//# sourceMappingURL=time-skew.service.js.map