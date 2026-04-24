"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPublicInvoicePdfUrl = buildPublicInvoicePdfUrl;
function buildPublicInvoicePdfUrl(token) {
    const apiBase = (process.env.PUBLIC_API_URL?.trim() ||
        process.env.PAYMENTS_CALLBACK_PUBLIC_URL?.trim() ||
        '').replace(/\/$/, '');
    if (!apiBase) {
        return undefined;
    }
    return `${apiBase}/api/public/invoice/pdf/${encodeURIComponent(token)}`;
}
//# sourceMappingURL=invoice-pdf.util.js.map