"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prismaClientMessage = prismaClientMessage;
exports.logServerError = logServerError;
const client_1 = require("@prisma/client");
function prismaClientMessage(error) {
    if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
            case 'P2002':
                return 'A record with this value already exists.';
            case 'P2003':
                return 'A related record is missing or invalid.';
            case 'P2011':
                return 'A required field was empty.';
            case 'P2025':
                return 'Record not found.';
            default:
                return 'A database error occurred. Please try again.';
        }
    }
    if (error instanceof client_1.Prisma.PrismaClientValidationError) {
        return 'Invalid data was sent. Check your input and try again.';
    }
    return 'Something went wrong. Please try again.';
}
function logServerError(context, error) {
    if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
        console.error(`[${context}] Prisma ${error.code}`, error.meta, error.message);
        return;
    }
    if (error instanceof client_1.Prisma.PrismaClientValidationError) {
        console.error(`[${context}] Prisma validation`, error.message);
        return;
    }
    console.error(`[${context}]`, error);
}
//# sourceMappingURL=prisma-exception.util.js.map