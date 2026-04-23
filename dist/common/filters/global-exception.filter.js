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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const Sentry = __importStar(require("@sentry/node"));
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
        const req = ctx.getRequest();
        const headerId = req.headers['x-request-id'];
        const requestId = req.requestId ??
            (typeof headerId === 'string' ? headerId : undefined) ??
            (Array.isArray(headerId) ? headerId[0] : undefined);
        const status = exception instanceof common_1.HttpException
            ? exception.getStatus()
            : common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        if (!(exception instanceof common_1.HttpException)) {
            (0, prisma_exception_util_1.logServerError)('GlobalExceptionFilter', exception);
            if (Sentry.isInitialized()) {
                Sentry.captureException(exception, {
                    tags: {
                        application: branding_1.APP_BRAND,
                        requestId: requestId ? String(requestId) : 'none',
                    },
                    extra: {
                        url: req.url,
                        method: req.method,
                    },
                });
            }
        }
        const body = exception instanceof common_1.HttpException
            ? exception.getResponse()
            : { message: (0, prisma_exception_util_1.prismaClientMessage)(exception) };
        const meta = { application: branding_1.APP_BRAND };
        const rid = requestId !== undefined ? { requestId: String(requestId) } : {};
        const payload = typeof body === 'string'
            ? {
                meta,
                statusCode: status,
                message: body,
                timestamp: new Date().toISOString(),
                ...rid,
            }
            : {
                meta,
                statusCode: status,
                ...(typeof body === 'object' && body !== null ? body : {}),
                timestamp: new Date().toISOString(),
                ...rid,
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