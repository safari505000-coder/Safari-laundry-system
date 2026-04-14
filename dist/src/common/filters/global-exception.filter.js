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
exports.GlobalExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const branding_1 = require("../constants/branding");
const prisma_exception_util_1 = require("./prisma-exception.util");
let GlobalExceptionFilter = class GlobalExceptionFilter {
    httpAdapterHost;
    constructor(httpAdapterHost) {
        this.httpAdapterHost = httpAdapterHost;
    }
    catch(exception, host) {
        const { httpAdapter } = this.httpAdapterHost;
        const ctx = host.switchToHttp();
        const status = exception instanceof common_1.HttpException
            ? exception.getStatus()
            : common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        if (!(exception instanceof common_1.HttpException)) {
            (0, prisma_exception_util_1.logServerError)('GlobalExceptionFilter', exception);
        }
        const body = exception instanceof common_1.HttpException
            ? exception.getResponse()
            : { message: (0, prisma_exception_util_1.prismaClientMessage)(exception) };
        const meta = { application: branding_1.APP_BRAND };
        const payload = typeof body === 'string'
            ? {
                meta,
                statusCode: status,
                message: body,
                timestamp: new Date().toISOString(),
            }
            : {
                meta,
                statusCode: status,
                ...(typeof body === 'object' && body !== null ? body : {}),
                timestamp: new Date().toISOString(),
            };
        httpAdapter.reply(ctx.getResponse(), payload, status);
    }
};
exports.GlobalExceptionFilter = GlobalExceptionFilter;
exports.GlobalExceptionFilter = GlobalExceptionFilter = __decorate([
    (0, common_1.Catch)(),
    __metadata("design:paramtypes", [core_1.HttpAdapterHost])
], GlobalExceptionFilter);
//# sourceMappingURL=global-exception.filter.js.map