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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlTowerStreamService = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const dispatch_events_1 = require("../../dispatch/dispatch.events");
const HEARTBEAT_MS = 12_000;
let ControlTowerStreamService = class ControlTowerStreamService {
    pushes = new rxjs_1.Subject();
    emit(kind, payload) {
        this.pushes.next({
            type: 'control-tower:update',
            data: JSON.stringify({
                kind,
                ...payload,
                at: new Date().toISOString(),
            }),
        });
    }
    handleOrderCreated(payload) {
        this.emit('order:created', { orderId: payload.orderId ?? null });
    }
    handleDispatchCreated(payload) {
        this.emit('dispatch:created', {
            dispatchId: typeof payload?.id === 'string' ? payload.id : null,
        });
    }
    handleDispatchAcknowledged(payload) {
        this.emit('dispatch:acknowledged', {
            dispatchId: payload.dispatchId ?? null,
        });
    }
    handleDispatchCompleted(payload) {
        this.emit('dispatch:completed', {
            dispatchId: payload.dispatchId ?? null,
        });
    }
    subscribeFeed() {
        const heartbeats = (0, rxjs_1.interval)(HEARTBEAT_MS).pipe((0, operators_1.map)(() => ({
            type: 'heartbeat',
            data: JSON.stringify({ ok: true, ts: new Date().toISOString() }),
        })));
        return (0, rxjs_1.merge)(this.pushes.asObservable(), heartbeats);
    }
};
exports.ControlTowerStreamService = ControlTowerStreamService;
__decorate([
    (0, event_emitter_1.OnEvent)(dispatch_events_1.ORDER_CREATED_EVENT, { async: true }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ControlTowerStreamService.prototype, "handleOrderCreated", null);
__decorate([
    (0, event_emitter_1.OnEvent)(dispatch_events_1.DISPATCH_CREATED_EVENT, { async: true }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ControlTowerStreamService.prototype, "handleDispatchCreated", null);
__decorate([
    (0, event_emitter_1.OnEvent)(dispatch_events_1.DISPATCH_ACKNOWLEDGED_EVENT, { async: true }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ControlTowerStreamService.prototype, "handleDispatchAcknowledged", null);
__decorate([
    (0, event_emitter_1.OnEvent)(dispatch_events_1.DISPATCH_COMPLETED_EVENT, { async: true }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ControlTowerStreamService.prototype, "handleDispatchCompleted", null);
exports.ControlTowerStreamService = ControlTowerStreamService = __decorate([
    (0, common_1.Injectable)()
], ControlTowerStreamService);
//# sourceMappingURL=control-tower-stream.service.js.map