"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.otelSdk = void 0;
const sdk_node_1 = require("@opentelemetry/sdk-node");
const auto_instrumentations_node_1 = require("@opentelemetry/auto-instrumentations-node");
const exporter_trace_otlp_http_1 = require("@opentelemetry/exporter-trace-otlp-http");
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
exports.otelSdk = endpoint ?
    new sdk_node_1.NodeSDK({
        traceExporter: new exporter_trace_otlp_http_1.OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }),
        instrumentations: [
            (0, auto_instrumentations_node_1.getNodeAutoInstrumentations)({
                '@opentelemetry/instrumentation-fs': { enabled: false },
            }),
        ],
        serviceName: process.env.OTEL_SERVICE_NAME ?? 'safari-erp-api',
    })
    : null;
exports.otelSdk?.start();
//# sourceMappingURL=tracing.js.map