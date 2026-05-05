"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonConsoleLogger = void 0;
const common_1 = require("@nestjs/common");
const request_async_context_1 = require("../tracing/request-async-context");
let JsonConsoleLogger = class JsonConsoleLogger extends common_1.ConsoleLogger {
    ctxFields() {
        const s = request_async_context_1.requestContext.getStore();
        if (!s) {
            return {};
        }
        const o = {};
        if (s.traceId) {
            o.traceId = s.traceId;
        }
        if (s.orderId) {
            o.orderId = s.orderId;
        }
        return o;
    }
    jsonPayload(message) {
        if (typeof message === 'string') {
            return message;
        }
        try {
            return JSON.stringify(message);
        }
        catch {
            return String(message);
        }
    }
    line(level, message, context) {
        return JSON.stringify({
            timestamp: new Date().toISOString(),
            level,
            context: context ?? this.context ?? 'Application',
            ...this.ctxFields(),
            message: this.jsonPayload(message),
        });
    }
    log(message, context) {
        process.stdout.write(`${this.line('log', message, context)}\n`);
    }
    error(message, stack, context) {
        process.stderr.write(`${JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'error',
            context: context ?? this.context ?? 'Application',
            ...this.ctxFields(),
            message: this.jsonPayload(message),
            stack: stack ?? undefined,
        })}\n`);
    }
    warn(message, context) {
        process.stderr.write(`${this.line('warn', message, context)}\n`);
    }
    debug(message, context) {
        process.stdout.write(`${this.line('debug', message, context)}\n`);
    }
    verbose(message, context) {
        process.stdout.write(`${this.line('verbose', message, context)}\n`);
    }
};
exports.JsonConsoleLogger = JsonConsoleLogger;
exports.JsonConsoleLogger = JsonConsoleLogger = __decorate([
    (0, common_1.Injectable)()
], JsonConsoleLogger);
//# sourceMappingURL=json-logger.js.map