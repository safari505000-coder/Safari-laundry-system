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
var HttpDrainService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpDrainService = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
let HttpDrainService = HttpDrainService_1 = class HttpDrainService {
    httpAdapterHost;
    logger = new common_1.Logger(HttpDrainService_1.name);
    constructor(httpAdapterHost) {
        this.httpAdapterHost = httpAdapterHost;
    }
    async beforeApplicationShutdown(signal) {
        this.logger.warn(`http_drain_begin signal=${signal ?? 'unknown'}`);
        const server = this.httpAdapterHost.httpAdapter.getHttpServer();
        await new Promise((resolve, reject) => {
            server.close((err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
        this.logger.warn('http_drain_complete');
    }
};
exports.HttpDrainService = HttpDrainService;
exports.HttpDrainService = HttpDrainService = HttpDrainService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.HttpAdapterHost])
], HttpDrainService);
//# sourceMappingURL=http-drain.service.js.map