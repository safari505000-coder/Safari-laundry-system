"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrandingResponseInterceptor = void 0;
const common_1 = require("@nestjs/common");
const stream_1 = require("stream");
const operators_1 = require("rxjs/operators");
const branding_1 = require("../constants/branding");
let BrandingResponseInterceptor = class BrandingResponseInterceptor {
    intercept(_context, next) {
        return next.handle().pipe((0, operators_1.map)((data) => {
            if (isBinaryLikeResponse(data)) {
                return data;
            }
            return {
                meta: { application: branding_1.APP_BRAND },
                data: data === undefined ? null : data,
            };
        }));
    }
};
exports.BrandingResponseInterceptor = BrandingResponseInterceptor;
exports.BrandingResponseInterceptor = BrandingResponseInterceptor = __decorate([
    (0, common_1.Injectable)()
], BrandingResponseInterceptor);
function isBinaryLikeResponse(data) {
    if (data instanceof common_1.StreamableFile)
        return true;
    if (Buffer.isBuffer(data))
        return true;
    if (data instanceof stream_1.Readable)
        return true;
    return false;
}
//# sourceMappingURL=branding-response.interceptor.js.map