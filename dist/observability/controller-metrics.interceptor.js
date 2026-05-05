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
exports.ControllerMetricsInterceptor = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const metrics_service_1 = require("./metrics.service");
let ControllerMetricsInterceptor = class ControllerMetricsInterceptor {
    metrics;
    constructor(metrics) {
        this.metrics = metrics;
    }
    intercept(context, next) {
        const req = context.switchToHttp().getRequest();
        const res = context.switchToHttp().getResponse();
        const started = performance.now();
        return next.handle().pipe((0, rxjs_1.tap)({
            next: () => this.observe(req, res, started),
            error: () => this.observe(req, res, started),
        }));
    }
    observe(req, res, started) {
        const route = req.route?.path ?? req.path ?? req.url ?? 'unknown';
        this.metrics.controllerDuration
            .labels(req.method ?? 'UNKNOWN', String(route), String(res.statusCode ?? 0))
            .observe(performance.now() - started);
    }
};
exports.ControllerMetricsInterceptor = ControllerMetricsInterceptor;
exports.ControllerMetricsInterceptor = ControllerMetricsInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [metrics_service_1.MetricsService])
], ControllerMetricsInterceptor);
//# sourceMappingURL=controller-metrics.interceptor.js.map