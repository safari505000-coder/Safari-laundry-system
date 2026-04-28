"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prismaClientMessage = prismaClientMessage;
exports.logServerError = logServerError;
const client_1 = require("@prisma/client");
function prismaClientMessage(error) {
    if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
            case 'P2002':
                return 'A record with this value already exists (duplicate key). If this was checkout, try again — the wallet row may have been created concurrently.';
            case 'P2003':
                return 'A related record is missing or invalid (foreign key). Check customer, driver, or order links.';
            case 'P2006':
                return 'Invalid value stored in the database for a field. Contact support with the time of the error.';
            case 'P2010':
                return 'Database schema mismatch. Ensure migrations are applied, then try again.';
            case 'P2011':
                return 'A required field was empty.';
            case 'P2014':
                return 'A database relation would be broken by this change. The related rows may need to be updated first.';
            case 'P2021':
                return 'A required database table is missing. Run `npx prisma migrate deploy` on the server, then try again.';
            case 'P2022':
                return 'A required database column is missing. Run migrations, then try again.';
            case 'P2025':
                return 'Record not found.';
            default:
                return `A database error occurred (${error.code}). Please try again, or run migrations if the system was just updated.`;
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